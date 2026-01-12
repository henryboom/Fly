import { _decorator, Animation, AnimationClip, AudioClip, Collider2D, Component, Contact2DType, Enum, IPhysics2DContact, isValid, Node, UITransform } from 'cc';
import { Bullet } from './Bullet';
import { GameManager } from './GameManager';
import { AudioMgr } from './AudioMgr';
const { ccclass, property } = _decorator;

// 敌机类型：用于区分不同体型/速度/出场逻辑（例如后续可扩展不同血量/分数等）
export enum EnemyType {
    Small = 1,
    Medium = 2,
    Large = 3,
}

// 单个敌机的控制脚本：负责
// 1) 按类型速度向下移动
// 2) 超出屏幕底部后自动销毁
// 3) 通过 Collider2D 的回调检测子弹命中，命中后扣血，血量归零播放动画并销毁
@ccclass('Enemy')
export class Enemy extends Component {
    // 当前敌机类型（编辑器里可设置）
    @property({ type: Enum(EnemyType) })
    enemyType: EnemyType = EnemyType.Small;

    // 三种类型的下落速度（单位：像素/秒）
    @property
    smallSpeed: number = 260;

    @property
    mediumSpeed: number = 200;

    @property
    largeSpeed: number = 140;

    // 销毁阈值：敌机 y 小于该值时自动销毁
    // 如果开启 autoDestroyByCanvasBottom，会在 onEnable() 自动按 Canvas 计算并覆盖
    @property
    destroyY: number = -800;

    // 是否根据 Canvas 的底部位置自动计算 destroyY
    // 这样不同分辨率/不同 Canvas 尺寸时，不需要手动改 destroyY
    @property
    autoDestroyByCanvasBottom: boolean = true;

    // 在“屏幕底部”之下额外预留的销毁边距（越大表示飞得更远才销毁）
    @property
    destroyMargin: number = 80;

    // 敌机的动画组件：命中/爆炸动画播放完再销毁节点
    @property({ type: Animation })
    anim: Animation = null;

    @property({ type: AnimationClip })
    hitClip: AnimationClip | null = null;

    @property({ type: AnimationClip })
    dieClip: AnimationClip | null = null;

    // 敌机血量：子弹命中后扣减，<=0 时触发 onHit()
    @property
    hp: number = 1;

    @property
    score: number = 1;

    @property({ type: AudioClip })
    enemyDownAudio: AudioClip = null;

    // 是否已进入“被击中/死亡”状态：进入后不再移动也不再重复处理命中
    private isHit = false;
    private collider: Collider2D | null = null;
    private destroyScheduled = false;
    private pendingDamage = 0;
    private pendingDestroyBullets = new Set<Node>();

    start(): void {
        this.collider = this.getComponent(Collider2D);
    }

    protected onEnable(): void {
        this.destroyScheduled = false;

        if (!this.collider) this.collider = this.getComponent(Collider2D);
        if (this.collider) {
            this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this.collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }

        // console.log('onEnable', this.node.name, this.enemyType, this.destroyY);

        // 每次节点激活（包括对象池复用）都重新计算一遍 destroyY 更安全
        if (!this.autoDestroyByCanvasBottom) return;

        const ui = this.findRootUITransform();
        if (!ui) return;

        // UITransform 的 contentSize/anchorPoint 决定了“底部”的世界位置：
        // 底部 y（以该 UITransform 所在节点局部坐标计）= -height * anchorY
        const h = ui.contentSize.height;
        const anchorY = ui.anchorPoint.y;
        this.destroyY = -h * anchorY - Math.max(0, this.destroyMargin);
    }

    protected onDisable(): void {
        if (!this.collider) return;
        this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null): void {
        if (this.isHit || this.destroyScheduled) return;
        // console.log('onBeginContact', selfCollider.node.name, otherCollider.node.name);
        const bullet = otherCollider.getComponent(Bullet);
        if (!bullet) return;
        if (bullet.hasHit) return;

        const bulletNode = otherCollider.node;
        if (!isValid(bulletNode, true)) return;
        if (this.pendingDestroyBullets.has(bulletNode)) return;

        bullet.hasHit = true;
        this.pendingDestroyBullets.add(bulletNode);
        this.pendingDamage += Math.max(0, bullet.damage);
    }

    // 被击中且血量归零后的处理：
    // - 标记 isHit，停止移动/停止重复扣血
    // - 有动画则等动画播完再销毁；没动画则直接销毁
    onHit(): void {
        if (this.isHit) return;
        if (this.enemyDownAudio) {
            AudioMgr.inst.playOneShot(this.enemyDownAudio, 0.5);
        }
        this.isHit = true;
        GameManager.instance?.addScore(this.score);
        if (this.collider) this.collider.enabled = false;// 停用碰撞检测，避免重复命中

        if (this.anim) {
            // 只监听一次动画结束事件：播放完击中/爆炸动画后再销毁敌机节点
            this.anim.once(Animation.EventType.FINISHED, () => {
                this.destroySelf();
            }, this);
            // 开始播放挂在敌机上的默认动画（编辑器里可指定默认 Clip）
            this.playDie();
            return;
        }

        this.destroySelf();
    }

    update(deltaTime: number) {
        this.flushPendingHits();

        // 已死亡/被击中就不再移动，也不再做命中检测
        if (this.isHit) return;

        // 敌机向下移动：y 递减（deltaTime 单位是秒）
        const position = this.node.position;
        const nextY = position.y - this.getSpeed() * deltaTime;
        this.node.setPosition(position.x, nextY, position.z);

        // 飞出屏幕下方后销毁，避免场景里对象越来越多
        if (nextY < this.destroyY) {
            this.destroySelf();
        }
    }

    // 扣血入口：根据伤害值减少 hp，归零则触发 onHit()
    private applyDamage(amount: number): void {
        if (this.isHit || this.destroyScheduled) return;
        const dmg = Math.max(0, amount);
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.onHit();
            return;
        }
        this.playHit();
    }

    // 根据类型返回下落速度
    private getSpeed(): number {
        switch (this.enemyType) {
            case EnemyType.Medium:
                return this.mediumSpeed;
            case EnemyType.Large:
                return this.largeSpeed;
            case EnemyType.Small:
            default:
                return this.smallSpeed;
        }
    }

    // 向上查找最近的 UITransform（通常会找到 Canvas 对应的 UITransform）
    private findRootUITransform(): UITransform | null {
        let cur = this.node.parent;
        while (cur) {
            const ui = cur.getComponent(UITransform);
            if (ui) return ui;
            cur = cur.parent;
        }
        return null;
    }

    private destroySelf(): void {
        if (this.destroyScheduled) return;
        this.destroyScheduled = true;
        if (isValid(this.node, true)) this.node.destroy();
    }

    private flushPendingHits(): void {
        if (this.pendingDestroyBullets.size > 0) {
            for (const bulletNode of this.pendingDestroyBullets) {
                if (isValid(bulletNode, true)) bulletNode.destroy();
            }
            this.pendingDestroyBullets.clear();
        }

        if (this.pendingDamage > 0) {
            const dmg = this.pendingDamage;
            this.pendingDamage = 0;
            this.applyDamage(dmg);
        }
    }

    private playHit(): void {
        if (!this.anim || !this.hitClip) return;
        this.anim.defaultClip = this.hitClip;
        this.anim.play();
    }

    private playDie(): void {
        if (!this.anim) return;
        if (this.dieClip) this.anim.defaultClip = this.dieClip;
        this.anim.play();
    }
}


