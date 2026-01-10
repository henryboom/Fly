import { _decorator, Component, Enum, EventTouch, Input, input, instantiate, Node, Prefab } from 'cc';
import { Bullet } from './Bullet';
const { ccclass, property } = _decorator;

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
    bulletSpeed: number = 800;

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

    //累计发射计时器：用来控制“按固定间隔发射”
    private fireElapsed = 0;
    private draggingTouchId: number | null = null;
    private readonly minX = -226;
    private readonly maxX = 226;
    private readonly minY = -387;
    private readonly maxY = 360;

    protected onLoad(): void {
        //触摸开始/移动/结束事件
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
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
    }

    onTouchStart(event: EventTouch): void {
        //只允许一根手指拖拽，防止多指干扰
        if (this.draggingTouchId !== null) return;
        //记录当前拖拽手指的 id，后续 move/end 只响应它
        this.draggingTouchId = event.getID();
    }

    onTouchMove(event: EventTouch): void {
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
        if (this.draggingTouchId !== event.getID()) return;
        this.draggingTouchId = null;
    }

    onTouchCancel(event: EventTouch): void {
        //系统打断/触摸被取消时，结束拖拽状态
        if (this.draggingTouchId !== event.getID()) return;
        this.draggingTouchId = null;
    }
    start() {

    }

    update(deltaTime: number) {
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

    private shoot(): void {
        if (this.bulletLevel === BulletLevel.Level2) {
            this.onshoot();
            this.twoshoot();
            return;
        }

        this.onshoot();
    }

    private onshoot(): void {
        const fireNode = this.firePoint ?? this.node;
        const worldPos = fireNode.getWorldPosition();
        this.spawnBullet(worldPos.x, worldPos.y, worldPos.z);
    }

    private twoshoot(): void {
        const left = this.firePointLv2 ?? this.firePoint ?? this.node;
        const right = this.firePointLv3 ?? this.firePoint ?? this.node;

        const leftPos = left.getWorldPosition();
        const rightPos = right.getWorldPosition();

        this.spawnBullet(leftPos.x, leftPos.y, leftPos.z, 900);
        this.spawnBullet(rightPos.x, rightPos.y, rightPos.z, 900);
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
        if (this.bulletLevel === BulletLevel.Level1) {
            this.bulletLevel = BulletLevel.Level2;
        }
    }

    private getActiveBulletPrefab(): Prefab | null {
        if (this.bulletLevel === BulletLevel.Level2 && this.bulletPrefabLv2) {
            return this.bulletPrefabLv2;
        }

        return this.bulletPrefab;
    }
}


