import { _decorator, Animation, AnimationClip, AudioClip, Collider2D, Component, Contact2DType, Enum, EventTouch, Input, input, instantiate, IPhysics2DContact, isValid, Node, Prefab } from 'cc';
import { Bullet } from './Bullet';
import { Enemy } from './Enemy';
import { GameManager } from './GameManager';
import { AudioMgr } from './AudioMgr';
const { ccclass, property } = _decorator;

export const PLAYER_HP_CHANGED_EVENT = 'player-hp-changed';

export enum BulletLevel {
    Level1 = 1,
    Level2 = 2,
}

export enum PowerUpType {
    BulletLevelUp = 1,
}

@ccclass('Player')
export class Player extends Component {
    //要发射的子弹“模版资源”（Prefab），需要在编辑器里拖拽赋值
    @property(Prefab)
    bulletPrefab: Prefab | null = null;

    @property(Prefab)
    bulletPrefabLv2: Prefab | null = null;

    //子弹生成后挂到哪个父节点下（通常是场景里的某个容器节点）
    //不赋值时，默认挂到 Player 的父节点下，避免子弹成为飞机子节点导致跟随飞机一起移动/缩放
    @property(Node)
    bulletRoot: Node | null = null;

    //发射频率：每秒发射多少颗子弹（例如 8 表示每秒 8 发）
    @property
    fireRate: number = 8;

    //子弹飞行速度：会写入 Bullet1 脚本的 speed 字段（像素/秒）
    @property
    bulletSpeed: number = 400;

    //子弹发射点：在飞机下面挂一个“虚拟节点”，把它拖到这里
    //发射时会读取这个节点的世界坐标，让子弹从机头位置出现
    @property(Node)
    firePoint: Node | null = null;


    //强化 子弹的发射位置
    @property(Node)
    firePointLv2: Node | null = null;
    @property(Node)
    firePointLv3: Node | null = null;

    @property({ type: Enum(BulletLevel) })
    bulletLevel: BulletLevel = BulletLevel.Level1;

    @property
    bulletLevelUpDuration: number = 10;

    //累计发射计时器：用来控制“按固定间隔发射”
    private fireElapsed = 0;
    private draggingTouchId: number | null = null;
    private readonly minX = -226;
    private readonly maxX = 226;
    private readonly minY = -387;
    private readonly maxY = 360;
    private collider: Collider2D | null = null;

    // 玩家最大生命值
    @property
    maxHp: number = 3;

    // 受击后的无敌时间（秒），用于避免与敌机持续接触导致连掉血
    @property
    invincibleDuration: number = 1;

    // 受击反馈动画（可不配，不影响逻辑）
    @property({ type: Animation })
    anim: Animation = null;

    // 坠毁动画
    @property({ type: AnimationClip })
    crashClip: AnimationClip | null = null;

    // 受击反馈动画（可不配，不影响逻辑）
    @property({ type: AnimationClip })
    hitClip: AnimationClip | null = null;


    @property({ type: AudioClip })
    bulletAudio: AudioClip | null = null;
    // 当前生命值：在 onLoad 时重置为 maxHp
    private hp = 0;
    // 无敌剩余时间（秒）：大于 0 时忽略碰撞伤害
    private invincibleRemaining = 0;
    private bulletLevelUpRemaining = 0;
    // 碰撞回调里不做破坏性操作，先打标记，等 update 再统一处理
    private hitQueued = false;
    // 本帧待处理的敌机（延迟执行 enemy.onHit()，避免碰撞回调里销毁导致 Box2D 报错）
    private pendingHitEnemies = new Set<Node>();
    private destroyScheduled = false;//是否计划销毁玩家节点

    protected onLoad(): void {
        this.hp = this.maxHp;
        this.emitHpChanged();
        //触摸开始/移动/结束事件
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);


        this.collider = this.getComponent(Collider2D);
        if (this.collider) {
            this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this.collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }

    }
    protected onDestroy(): void {
        //移除触摸开始事件
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        //移除触摸移动事件
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        //移除触摸结束事件
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        //移除触摸取消事件
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        if (this.collider) {
            this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }
    }

    onTouchStart(event: EventTouch): void {
        if (this.destroyScheduled) return;
        if (GameManager.instance.isPaused()) return;
        //只允许一根手指拖拽，防止多指干扰
        if (this.draggingTouchId !== null) return;
        //记录当前拖拽手指的 id，后续 move/end 只响应它
        this.draggingTouchId = event.getID();
    }

    onTouchMove(event: EventTouch): void {
        //坠机后或者暂停后，不允许拖拽移动
        if (GameManager.instance.isPaused()) return;
        if (this.destroyScheduled) return;
        if (this.draggingTouchId !== event.getID()) return;
        //获取本次触摸相对上一帧的位移（增量）
        let delta = event.getDelta();
        //记录当前节点位置
        let position = this.node.position;
        //把增量叠加到节点坐标上，实现跟手移动
        let nextX = position.x + delta.x;
        nextX = Math.min(this.maxX, Math.max(this.minX, nextX));
        let nextY = position.y + delta.y;
        nextY = Math.min(this.maxY, Math.max(this.minY, nextY));
        this.node.setPosition(nextX, nextY, position.z);
    }
    onTouchEnd(event: EventTouch): void {
        if (this.destroyScheduled) return;
        if (this.draggingTouchId !== event.getID()) return;
        this.draggingTouchId = null;
    }

    onTouchCancel(event: EventTouch): void {
        if (this.destroyScheduled) return;
        //系统打断/触摸被取消时，结束拖拽状态
        if (this.draggingTouchId !== event.getID()) return;
        this.draggingTouchId = null;
    }
    start() {

    }

    update(deltaTime: number) {
        if (this.destroyScheduled) return;
        // 把碰撞回调里累积的“受击事件”放到 update 里处理，避免物理回调时销毁节点
        this.flushPendingHits();
        if (this.invincibleRemaining > 0) {
            this.invincibleRemaining = Math.max(0, this.invincibleRemaining - deltaTime);
        }
        if (this.bulletLevelUpRemaining > 0) {
            this.bulletLevelUpRemaining = Math.max(0, this.bulletLevelUpRemaining - deltaTime);
            if (this.bulletLevelUpRemaining <= 0 && this.bulletLevel === BulletLevel.Level2) {
                this.bulletLevel = BulletLevel.Level1;
            }
        }
        //没有配置子弹 Prefab 时，不进行发射
        if (!this.getActiveBulletPrefab()) return;
        //发射速率为 0 或负数时，视为关闭自动发射
        if (this.fireRate <= 0) return;

        //两次发射之间的间隔（秒）
        //比如 fireRate=8，则 interval=0.125 秒发一颗
        const interval = 1 / this.fireRate;
        //累加这一帧过去的时间
        this.fireElapsed += deltaTime;

        //用 while 而不是 if：如果某一帧卡顿（deltaTime 很大）
        //可以在下一帧把“欠下的子弹”补发出来，使平均发射频率更稳定
        while (this.fireElapsed >= interval) {
            this.fireElapsed -= interval;
            this.shoot();
        }
    }


    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null): void {
        if (this.destroyScheduled) return;
        const enemy = otherCollider.getComponent(Enemy);
        if (!enemy) return;
        // 无敌期间不受伤
        if (this.invincibleRemaining > 0) return;
        // 同一帧多次回调只处理一次扣血（避免一次接触触发多次 BEGIN_CONTACT）
        if (this.hitQueued) return;

        const enemyNode = otherCollider.node;
        if (!isValid(enemyNode, true)) return;

        this.hitQueued = true;
        this.pendingHitEnemies.add(enemyNode);
    }
    private shoot(): void {
        if (this.bulletLevel === BulletLevel.Level2) {
            this.onshoot();
            this.twoshoot();
            return;
        }

        this.onshoot();
    }

    private onshoot(): void {
        if (this.bulletAudio) {
            AudioMgr.inst.playOneShot(this.bulletAudio, 0.2);
        }
        const fireNode = this.firePoint ?? this.node;
        const worldPos = fireNode.getWorldPosition();
        this.spawnBullet(worldPos.x, worldPos.y, worldPos.z);
    }

    private twoshoot(): void {
        if (this.bulletAudio) {
            AudioMgr.inst.playOneShot(this.bulletAudio, 0.2);
        }
        const left = this.firePointLv2 ?? this.firePoint ?? this.node;
        const right = this.firePointLv3 ?? this.firePoint ?? this.node;

        const leftPos = left.getWorldPosition();
        const rightPos = right.getWorldPosition();

        this.spawnBullet(leftPos.x, leftPos.y, leftPos.z, this.bulletSpeed);
        this.spawnBullet(rightPos.x, rightPos.y, rightPos.z, this.bulletSpeed);
    }

    private spawnBullet(worldX: number, worldY: number, worldZ: number, speedOverride?: number): void {
        const activePrefab = this.getActiveBulletPrefab();
        if (!activePrefab) return;

        const root = this.bulletRoot ?? this.node.parent;
        if (!root) return;

        const bulletNode = instantiate(activePrefab);
        bulletNode.parent = root;
        bulletNode.setWorldPosition(worldX, worldY, worldZ);

        const bullet = bulletNode.getComponent(Bullet);
        if (bullet) bullet.speed = speedOverride ?? this.bulletSpeed;
    }

    public applyPowerUp(type: PowerUpType): void {
        if (type === PowerUpType.BulletLevelUp) {
            this.upgradeBulletLevel();
        }
    }

    public upgradeBulletLevel(): void {
        this.bulletLevel = BulletLevel.Level2;
        this.bulletLevelUpRemaining = Math.max(0, this.bulletLevelUpDuration);
    }

    public getHp(): number {
        return this.hp;
    }

    public getMaxHp(): number {
        return this.maxHp;
    }

    private getActiveBulletPrefab(): Prefab | null {
        if (this.bulletLevel === BulletLevel.Level2 && this.bulletPrefabLv2) {
            return this.bulletPrefabLv2;
        }

        return this.bulletPrefab;
    }

    private flushPendingHits(): void {
        if (!this.hitQueued) return;
        this.hitQueued = false;

        if (this.pendingHitEnemies.size > 0) {
            // 玩家撞到敌机：敌机直接进入死亡/爆炸流程
            for (const enemyNode of this.pendingHitEnemies) {
                if (!isValid(enemyNode, true)) continue;
                const enemy = enemyNode.getComponent(Enemy);
                if (enemy) enemy.onHit();
            }
            this.pendingHitEnemies.clear();
        }

        // 玩家扣血：这里先按 1 点处理，后续你也可以改成由敌机类型/伤害值决定
        this.applyDamage(1);
    }

    private applyDamage(amount: number): void {
        if (this.destroyScheduled) return;
        const dmg = Math.max(0, amount);
        if (dmg <= 0) return;

        this.hp -= dmg;
        this.emitHpChanged();
        // 进入无敌状态，并播放受击动画
        this.invincibleRemaining = Math.max(0, this.invincibleDuration);
        this.playHit();

        if (this.hp <= 0) {
            this.destroySelf();
        }
    }

    private emitHpChanged(): void {
        this.node.emit(PLAYER_HP_CHANGED_EVENT, this.hp, this.maxHp);
    }

    private playHit(): void {
        if (!this.anim || !this.hitClip) return;
        this.anim.defaultClip = this.hitClip;
        this.anim.play();
    }

    private destroySelf(): void {
        if (this.destroyScheduled) return;
        this.destroyScheduled = true;
        // 禁用碰撞器，防止继续触发碰撞事件
        if (this.collider) this.collider.enabled = false;

        // 播放坠毁动画，等动画播完再销毁
        if (this.anim && this.crashClip) {
            this.anim.once(Animation.EventType.FINISHED, this.destroyNow, this);
            this.anim.defaultClip = this.crashClip;
            this.anim.play();

            this.scheduleOnce(this.destroyNow, Math.max(0, this.crashClip.duration) + 0.05);
            return;
        }

        this.destroyNow();
    }

    private destroyNow(): void {
        if (!isValid(this.node, true)) return;
        // 通知游戏管理器玩家死亡
        const manager = GameManager.instance;
        if (manager) manager.gameOver();
        this.node.destroy();
    }
}


