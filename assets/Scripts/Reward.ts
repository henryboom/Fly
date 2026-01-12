import { _decorator, Animation, AnimationClip, AudioClip, Collider2D, Component, Contact2DType, Enum, IPhysics2DContact, isValid, Node, UITransform } from 'cc';
import { Enemy } from './Enemy';
import { GameManager } from './GameManager';
import { Player, PowerUpType } from './Player';
import { AudioMgr } from './AudioMgr';
const { ccclass, property } = _decorator;

export enum RewardType {
    // 升级子弹：拾取后切换到 2 级发射模式
    BulletLevelUp = 1,
    // 炸弹：拾取后清屏（只销毁当前“视口内”的敌机）
    Bomb = 2,
}

@ccclass('Reward')
export class Reward extends Component {
    // 奖励类型：决定拾取后的效果（升级子弹 / 炸弹清屏）
    @property({ type: Enum(RewardType) })
    rewardType: RewardType = RewardType.BulletLevelUp;

    // 下落速度：奖励从上往下移动（像素/秒）
    @property
    speed: number = 200;

    // 是否根据 Canvas 的底部世界坐标自动判断“出屏销毁”
    @property
    autoDestroyByCanvasBottom: boolean = true;

    // 出屏销毁边距：越大表示落到更下面才销毁
    @property
    destroyMargin: number = 80;

    // 动画组件：用于播放拾取效果的动画（可不配，不影响拾取逻辑）
    @property({ type: Animation })
    anim: Animation = null;

    // 生成后默认循环播放的待机动画（例如摇晃/漂浮）
    @property({ type: AnimationClip })
    idleClip: AnimationClip | null = null;

    // 拾取动画：播放完再销毁 Reward 节点（没有就直接销毁）
    @property({ type: AnimationClip })
    pickupClip: AnimationClip | null = null;

    // 敌机容器：炸弹清屏时优先从这个节点下面找敌机
    // 不配置时，会尝试在场景里找名为 EnemyParent 的节点；再不行就扫描整个场景
    @property({ type: Node })
    enemyRoot: Node | null = null;

    @property({ type: AudioClip })
    pickupAudio1: AudioClip | null = null;
    @property({ type: AudioClip })
    pickupAudio2: AudioClip | null = null;

    private collider: Collider2D | null = null;
    // 是否已被拾取：拾取后停止移动与出屏检测
    private picked = false;
    // 是否已经收到了拾取事件：用于把“碰撞回调”延迟到 update 中结算，避免物理回调里做破坏性操作
    private pickupQueued = false;
    // 待结算拾取的玩家引用：碰撞回调里暂存
    private pendingPlayer: Player | null = null;
    // 自动销毁的“世界坐标 Y 阈值”：奖励的世界 Y 小于该值时销毁
    private destroyWorldY = -1000;

    protected onEnable(): void {
        // 节点激活（包括对象池复用）时重置状态
        this.picked = false;
        this.pickupQueued = false;
        this.pendingPlayer = null;

        // 生成时默认播放待机循环动画（摇晃/漂浮等）
        this.playIdle();

        // 注册碰撞回调：拾取逻辑统一走 Collider2D 的 BEGIN_CONTACT
        if (!this.collider) this.collider = this.getComponent(Collider2D);
        if (this.collider) {
            this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this.collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }

        // 计算“Canvas 底部”的世界坐标，用于出屏销毁
        if (this.autoDestroyByCanvasBottom) {
            const ui = this.findRootUITransform();
            if (ui) {
                const rect = ui.getBoundingBoxToWorld();
                this.destroyWorldY = rect.y - Math.max(0, this.destroyMargin);
            }
        }
    }

    protected onDisable(): void {
        // 节点失活时取消事件与定时器，避免复用/销毁后残留回调
        if (this.collider) this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        this.unschedule(this.destroyNow);
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null): void {
        // console.log('onBeginContact', selfCollider.node.name, otherCollider.node.name, contact);
        // 已拾取 / 已排队结算，就不再重复处理
        if (this.picked || this.pickupQueued) return;
        // 只响应 Player 的拾取
        const player = otherCollider.getComponent(Player);
        if (!player) return;

        // 物理回调里不直接改场景对象（destroy/播放动画/遍历敌机等），只打标记
        // 在 update 的 flushPickup() 里再统一结算，稳定且避免物理引擎回调时的潜在报错
        this.pickupQueued = true;
        this.pendingPlayer = player;
    }

    update(deltaTime: number) {
        // 把碰撞回调里排队的拾取事件在这里结算
        this.flushPickup();
        // 一旦被拾取，就不再下落与出屏销毁（等动画/立即销毁）
        if (this.picked) return;

        // 下落运动：y 递减
        const position = this.node.position;
        const nextY = position.y - this.speed * deltaTime;
        this.node.setPosition(position.x, nextY, position.z);

        // 出屏销毁：用世界坐标比较，避免不同 Canvas 尺寸/分辨率下需要手动改数值
        if (this.autoDestroyByCanvasBottom) {
            const worldY = this.node.getWorldPosition().y;
            if (worldY < this.destroyWorldY) this.destroyNow();
        }
    }

    private flushPickup(): void {
        // 没有排队拾取就直接返回
        if (!this.pickupQueued) return;
        this.pickupQueued = false;
        const player = this.pendingPlayer;
        this.pendingPlayer = null;

        // 玩家已无效：直接销毁奖励，避免悬空对象
        if (!player || !isValid(player.node, true)) {
            this.destroyNow();
            return;
        }

        // 结算奖励效果，再进入“拾取态”（播放动画并销毁）
        this.applyReward(player);
        this.onPicked();
    }

    private applyReward(player: Player): void {
        // 1) 升级子弹：复用 Player 现有的 PowerUp 流程
        if (this.rewardType === RewardType.BulletLevelUp) {
            if (this.pickupAudio1) {
                AudioMgr.inst.playOneShot(this.pickupAudio1, 0.8);
            }
            player.applyPowerUp(PowerUpType.BulletLevelUp);
            return;
        }

        // 2) 炸弹：存入库存（最多 5 个），双击屏幕再触发清屏
        if (this.rewardType === RewardType.Bomb) {
            // console.log('applyReward Bomb', this.pickupAudio2);
            if (this.pickupAudio2) {

                AudioMgr.inst.playOneShot(this.pickupAudio2, 0.8);
            }
            GameManager.instance?.addBomb(1);
        }
    }

    private destroyEnemiesInViewport(): void {
        // 炸弹清屏：直接把“敌机父节点”下所有 Enemy 全部 onHit()
        const scene = this.node.scene;
        if (!scene) return;

        // 优先使用显式配置的 enemyRoot；否则找 EnemyParent；再不行兜底为 scene 根节点
        const root = this.enemyRoot ?? this.findNodeByName(scene, 'EnemyParent') ?? scene;
        const enemies = root.getComponentsInChildren(Enemy);
        for (const enemy of enemies) enemy.onHit();
    }

    private onPicked(): void {
        // 进入拾取态：停止碰撞/移动，播放拾取动画并销毁
        if (this.picked) return;
        this.picked = true;
        if (this.collider) this.collider.enabled = false;

        // 有拾取动画：播完再销毁；否则立即销毁
        if (this.anim && this.pickupClip) {
            // FINISHED：正常情况下动画播完会触发；scheduleOnce 是兜底，避免极端情况下收不到事件
            this.anim.once(Animation.EventType.FINISHED, this.destroyNow, this);
            this.anim.defaultClip = this.pickupClip;
            this.anim.play();
            this.scheduleOnce(this.destroyNow, Math.max(0, this.pickupClip.duration) + 0.05);
            return;
        }

        this.destroyNow();
    }

    private playIdle(): void {
        if (!this.anim || !this.idleClip) return;
        this.anim.defaultClip = this.idleClip;
        this.anim.play();
    }

    private destroyNow(): void {
        if (!isValid(this.node, true)) return;
        this.unschedule(this.destroyNow);
        this.node.destroy();
    }

    // 从自己往上找最近的 UITransform（通常会找到 Canvas 对应的 UITransform）
    private findRootUITransform(): UITransform | null {
        let cur = this.node.parent;
        while (cur) {
            const ui = cur.getComponent(UITransform);
            if (ui) return ui;
            cur = cur.parent;
        }
        return null;
    }

    // 在节点树中按名字递归查找节点（用于兜底定位 EnemyParent）
    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNodeByName(child, name);
            if (found) return found;
        }
        return null;
    }
}
