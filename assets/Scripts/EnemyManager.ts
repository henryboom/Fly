import { _decorator, Component, instantiate, Node, Prefab } from 'cc';
import { Reward, RewardType } from './Reward';
const { ccclass, property } = _decorator;

// 本次生成要用哪个预制体 + 生成的 X 范围
type SpawnConfig = {
    prefab: Prefab;
    minX: number;
    maxX: number;
};

type RewardSpawnConfig = {
    prefab: Prefab;
    rewardType: RewardType;
};

// 敌机管理器：负责按一定频率、按权重概率随机生成敌机
@ccclass('EnemyManager')
export class EnemyManager extends Component {
    // 敌机生成出来后挂到哪个节点下（建议拖一个 EnemyParent / EnemyRoot）
    // 不设置则默认挂到当前挂载 EnemyManager 的节点下
    @property({ type: Node })
    enemyRoot: Node | null = null;

    // 三种敌机预制体（小/中/大）。不赋值的那种类型会自动被跳过
    @property({ type: Prefab })
    smallEnemyPrefab: Prefab | null = null;

    @property({ type: Prefab })
    mediumEnemyPrefab: Prefab | null = null;

    @property({ type: Prefab })
    largeEnemyPrefab: Prefab | null = null;

    // 生成间隔（秒）：0.6 表示每 0.6 秒生成一次
    @property
    spawnInterval: number = 0.6;

    // 生成时固定的 Y（通常是屏幕上方之外）
    @property
    spawnY: number = 520;

    // 兜底的 X 范围：当权重配置无效/或某类预制体缺失时使用
    @property
    defaultSpawnMinX: number = -226;

    @property
    defaultSpawnMaxX: number = 226;

    // 小型敌机生成的 X 范围
    @property
    smallSpawnMinX: number = -226;

    @property
    smallSpawnMaxX: number = 226;

    // 中型敌机生成的 X 范围
    @property
    mediumSpawnMinX: number = -200;

    @property
    mediumSpawnMaxX: number = 200;

    // 大型敌机生成的 X 范围（一般更窄，避免贴边）
    @property
    largeSpawnMinX: number = -140;

    @property
    largeSpawnMaxX: number = 140;

    // 生成权重（不是百分比）：权重越大越容易被选中
    // 例如 70/25/5 表示大约 70%/25%/5% 的生成占比（长期统计接近）
    @property
    smallFrequency: number = 70;

    @property
    mediumFrequency: number = 25;

    @property
    largeFrequency: number = 5;

    // 奖励生成出来后挂到哪个节点下（建议拖一个 RewardParent / RewardRoot）
    // 不设置则默认挂到当前挂载 EnemyManager 的节点下
    @property({ type: Node })
    rewardRoot: Node | null = null;

    // 两种奖励预制体（升级子弹 / 炸弹）。不赋值的那种会自动被跳过
    @property({ type: Prefab })
    bulletLevelUpRewardPrefab: Prefab | null = null;

    @property({ type: Prefab })
    bombRewardPrefab: Prefab | null = null;

    // 奖励生成间隔（秒）：<= 0 表示不生成
    @property
    rewardSpawnInterval: number = 8;

    // 奖励生成时固定的 Y（通常是屏幕上方之外）
    @property
    rewardSpawnY: number = 520;

    // 奖励生成的 X 范围
    @property
    rewardSpawnMinX: number = -200;

    @property
    rewardSpawnMaxX: number = 200;

    // 奖励权重（不是百分比）：权重越大越容易被选中
    @property
    bulletLevelUpRewardFrequency: number = 70;

    @property
    bombRewardFrequency: number = 30;

    // 累计时间：用“累计 + while”方式避免掉帧导致漏生成
    private spawnTimer = 0;
    private rewardSpawnTimer = 0;

    update(deltaTime: number) {
        // <= 0 表示不生成（相当于暂停刷怪）
        if (this.spawnInterval > 0) {
            this.spawnTimer += deltaTime;
            while (this.spawnTimer >= this.spawnInterval) {
                this.spawnTimer -= this.spawnInterval;
                this.spawnEnemy();
            }
        }

        if (this.rewardSpawnInterval > 0) {
            this.rewardSpawnTimer += deltaTime;
            while (this.rewardSpawnTimer >= this.rewardSpawnInterval) {
                this.rewardSpawnTimer -= this.rewardSpawnInterval;
                this.spawnReward();
            }
        }
    }

    // 由本管理器自己按“权重 + 类型范围”生成一架敌机
    private spawnEnemy(): void {
        const root = this.enemyRoot ?? this.node;
        const config = this.pickSpawnConfig();
        if (!root || !config) return;

        const enemy = instantiate(config.prefab);
        enemy.parent = root;
        enemy.setPosition(this.randomSpawnX(config.minX, config.maxX), this.spawnY, 0);
    }

    private spawnReward(): void {
        const root = this.rewardRoot ?? this.node;
        const config = this.pickRewardSpawnConfig();
        if (!root || !config) return;

        const rewardNode = instantiate(config.prefab);
        rewardNode.parent = root;
        rewardNode.setPosition(this.randomSpawnX(this.rewardSpawnMinX, this.rewardSpawnMaxX), this.rewardSpawnY, 0);

        const reward = rewardNode.getComponent(Reward);
        if (!reward) return;
        reward.rewardType = config.rewardType;
        reward.enemyRoot = this.enemyRoot ?? this.node;
    }

    // 外部手动生成：调用方传入预制体与 X 范围（适合做关卡脚本/特殊波次）
    public spawnEnemyWithXRange(prefab: Prefab, xMin: number, xMax: number): void {
        const root = this.enemyRoot ?? this.node;
        if (!root || !prefab) return;

        const enemy = instantiate(prefab);
        enemy.parent = root;
        enemy.setPosition(this.randomSpawnX(xMin, xMax), this.spawnY, 0);
    }

    // 在给定范围内随机一个 X；自动处理 xMin/xMax 传反的情况
    private randomSpawnX(xMin: number, xMax: number): number {
        const minX = Math.min(xMin, xMax);
        const maxX = Math.max(xMin, xMax);
        return minX + (maxX - minX) * Math.random();
    }

    // 根据“可用预制体 + 权重”选出本次生成配置（prefab + xRange）
    private pickSpawnConfig(): SpawnConfig | null {
        const smallW = this.smallEnemyPrefab ? Math.max(0, this.smallFrequency) : 0;
        const mediumW = this.mediumEnemyPrefab ? Math.max(0, this.mediumFrequency) : 0;
        const largeW = this.largeEnemyPrefab ? Math.max(0, this.largeFrequency) : 0;

        // total == 0 说明：要么都没设置 prefab，要么权重都为 0
        const total = smallW + mediumW + largeW;
        if (total <= 0) {
            const fallback = this.pickFallbackPrefab();
            if (!fallback) return null;
            return {
                prefab: fallback,
                minX: this.defaultSpawnMinX,
                maxX: this.defaultSpawnMaxX,
            };
        }

        // r 落在哪个区间，就选中哪个类型
        const r = Math.random() * total;
        if (r < smallW && this.smallEnemyPrefab) {
            return {
                prefab: this.smallEnemyPrefab,
                minX: this.smallSpawnMinX,
                maxX: this.smallSpawnMaxX,
            };
        }

        if (r < smallW + mediumW && this.mediumEnemyPrefab) {
            return {
                prefab: this.mediumEnemyPrefab,
                minX: this.mediumSpawnMinX,
                maxX: this.mediumSpawnMaxX,
            };
        }

        if (this.largeEnemyPrefab) {
            return {
                prefab: this.largeEnemyPrefab,
                minX: this.largeSpawnMinX,
                maxX: this.largeSpawnMaxX,
            };
        }

        // 理论上不会走到这里；作为安全兜底，仍返回一个可用的 prefab
        const fallback = this.pickFallbackPrefab();
        if (!fallback) return null;
        return {
            prefab: fallback,
            minX: this.defaultSpawnMinX,
            maxX: this.defaultSpawnMaxX,
        };
    }

    // 返回任意一个已设置的预制体（按小/中/大优先），用于兜底生成
    private pickFallbackPrefab(): Prefab | null {
        return this.smallEnemyPrefab ?? this.mediumEnemyPrefab ?? this.largeEnemyPrefab ?? null;
    }

    private pickRewardSpawnConfig(): RewardSpawnConfig | null {
        const levelUpW = this.bulletLevelUpRewardPrefab ? Math.max(0, this.bulletLevelUpRewardFrequency) : 0;
        const bombW = this.bombRewardPrefab ? Math.max(0, this.bombRewardFrequency) : 0;
        const total = levelUpW + bombW;
        if (total <= 0) return null;

        const r = Math.random() * total;
        if (r < levelUpW && this.bulletLevelUpRewardPrefab) {
            return { prefab: this.bulletLevelUpRewardPrefab, rewardType: RewardType.BulletLevelUp };
        }

        if (this.bombRewardPrefab) {
            return { prefab: this.bombRewardPrefab, rewardType: RewardType.Bomb };
        }

        if (this.bulletLevelUpRewardPrefab) {
            return { prefab: this.bulletLevelUpRewardPrefab, rewardType: RewardType.BulletLevelUp };
        }

        return null;
    }


}


