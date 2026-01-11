import { _decorator, Component, Input, input, Node } from 'cc';
import { Enemy } from './Enemy';
const { ccclass, property } = _decorator;

export const BOMB_COUNT_CHANGED_EVENT = 'bomb-count-changed';

@ccclass('GameManager')
export class GameManager extends Component {
    static instance: GameManager | null = null;

    @property({ type: Node })
    enemyRoot: Node | null = null;

    @property
    maxBombCount: number = 99;

    @property
    doubleTapInterval: number = 0.3;

    private bombCount = 0;
    private lastTapTime = 0;

    protected onLoad(): void {
        GameManager.instance = this;
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.emitBombCountChanged();
    }

    protected onDestroy(): void {
        if (GameManager.instance === this) GameManager.instance = null;
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    public addBomb(amount: number = 1): void {
        const add = Math.max(0, amount);
        this.bombCount = Math.min(this.maxBombCount, this.bombCount + add);
        this.emitBombCountChanged();
    }

    public getBombCount(): number {
        return this.bombCount;
    }

    public tryUseBomb(): boolean {
        if (this.bombCount <= 0) return false;
        this.bombCount -= 1;
        this.emitBombCountChanged();
        this.clearAllEnemies();
        return true;
    }

    private onTouchEnd(): void {
        const now = performance.now() / 1000;
        const dt = now - this.lastTapTime;
        this.lastTapTime = now;
        if (dt > 0 && dt <= this.doubleTapInterval) {
            this.tryUseBomb();
        }
    }

    private clearAllEnemies(): void {
        const scene = this.node.scene;
        if (!scene) return;
        const root = this.enemyRoot ?? this.findNodeByName(scene, 'EnemyParent') ?? scene;
        const enemies = root.getComponentsInChildren(Enemy);
        for (const enemy of enemies) enemy.onHit();
    }

    private emitBombCountChanged(): void {
        this.node.emit(BOMB_COUNT_CHANGED_EVENT, this.bombCount);
    }

    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNodeByName(child, name);
            if (found) return found;
        }
        return null;
    }
}


