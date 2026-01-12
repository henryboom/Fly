import { _decorator, AudioClip, AudioSource, Component, director, Input, input, isValid, Label, Node, sys } from 'cc';
import { Enemy } from './Enemy';
import { GameOverUI } from './GameOverUI';
import { AudioMgr } from './AudioMgr';
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


    @property
    score: number = 100;

    @property({ type: Label })
    scoreLabel: Label | null = null;

    @property({ type: Node })
    pauseButton: Node | null = null;

    @property({ type: Node })
    resumeButton: Node | null = null;
    @property({ type: Node })
    gameOverUI: Node | null = null;

    @property({ type: AudioClip })
    gameMusic: AudioClip | null = null;


    @property({ type: AudioClip })
    gameOverAudio: AudioClip | null = null;

    @property({ type: AudioClip })
    buttonAudio: AudioClip | null = null;
    private bombCount = 0;
    private lastTapTime = 0;
    private paused = false;
    private readonly highestScoreKey = 'fly_highest_score';
    private pausedSceneAudioSources: AudioSource[] = [];


    protected onLoad(): void {
        GameManager.instance = this;
        this.score = 0;
        //初始化节点图标显示
        if (this.pauseButton) this.pauseButton.active = true;
        if (this.resumeButton) this.resumeButton.active = false;
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.emitBombCountChanged();

        //播放背景音乐
        if (this.gameMusic) {
            AudioMgr.inst.play(this.gameMusic, 0.3);

        }
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

    public addScore(amount: number): void {
        const add = Math.max(0, amount);
        this.score += add;
        if (this.scoreLabel) this.scoreLabel.string = this.score.toString();
    }

    public getScore(): number {
        return this.score;
    }

    public pauseGame(): void {
        if (this.paused) return;
        if (this.buttonAudio) {
            AudioMgr.inst.playOneShot(this.buttonAudio, 0.2);
        }
        AudioMgr.inst.pause();
        this.pauseSceneAudioSources();
        //改变节点图标显示
        if (this.pauseButton) this.pauseButton.active = false;
        if (this.resumeButton) this.resumeButton.active = true;

        this.paused = true;
        director.pause();
    }

    public resumeGame(): void {
        if (!this.paused) return;
        if (this.buttonAudio) {
            AudioMgr.inst.playOneShot(this.buttonAudio, 0.2);
        }
        AudioMgr.inst.resume();
        this.resumeSceneAudioSources();
        //改变节点图标显示
        if (this.pauseButton) this.pauseButton.active = true;
        if (this.resumeButton) this.resumeButton.active = false;
        this.paused = false;
        director.resume();
    }

    public isPaused(): boolean {
        return this.paused;
    }

    private pauseSceneAudioSources(): void {
        this.pausedSceneAudioSources.length = 0;
        const scene = this.node.scene;
        if (!scene) return;
        const sources = scene.getComponentsInChildren(AudioSource);
        for (const src of sources) {
            const anySrc = src as any;
            const playing = typeof anySrc.playing === 'boolean' ? anySrc.playing : true;
            if (!playing) continue;
            this.pausedSceneAudioSources.push(src);
            src.pause();
        }
    }

    private resumeSceneAudioSources(): void {
        if (this.pausedSceneAudioSources.length === 0) return;
        for (const src of this.pausedSceneAudioSources) {
            if (!src) continue;
            if (!isValid(src.node, true)) continue;
            src.play();
        }
        this.pausedSceneAudioSources.length = 0;
    }

    public tryUseBomb(): boolean {
        if (this.bombCount <= 0) return false;
        this.bombCount -= 1;
        this.emitBombCountChanged();
        this.clearAllEnemies();
        return true;
    }

    public gameOver(): void {
        const manager = GameManager.instance;
        if (!manager) return;
        if (manager.gameOverAudio) {
            AudioMgr.inst.playOneShot(manager.gameOverAudio, 0.5);
        }
        manager.pauseGame();
        const scene = manager.node.scene;
        if (!scene) return;

        const latestScore = manager.score;
        const highestScore = Math.max(manager.getHighestScore(), latestScore);
        manager.setHighestScore(highestScore);

        const uiNode = manager.gameOverUI ?? manager.findNodeByName(scene, 'GameOverUI');
        const ui = uiNode?.getComponent(GameOverUI);
        if (ui) ui.showGameOverUI(highestScore, latestScore);
    }

    //重新开始游戏
    public restartGame(): void {
        const manager = GameManager.instance;
        if (!manager) return;
        if (manager.buttonAudio) {
            AudioMgr.inst.playOneShot(manager.buttonAudio, 0.2);
        }
        const scene = director.getScene();
        const sceneName = scene?.name ?? '02-GameScene';
        manager.paused = false;
        director.resume();
        director.loadScene(sceneName);
    }
    //推出游戏
    public exitGame(): void {
        if (this.buttonAudio) {
            AudioMgr.inst.playOneShot(this.buttonAudio, 0.2);
        }
        director.end();
    }

    private getHighestScore(): number {
        const raw = sys.localStorage.getItem(this.highestScoreKey);
        const n = raw ? Number(raw) : 0;
        return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    }

    private setHighestScore(score: number): void {
        const s = Math.max(0, Math.floor(score));
        sys.localStorage.setItem(this.highestScoreKey, String(s));
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


