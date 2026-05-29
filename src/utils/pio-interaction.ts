import type { PioInteractionConfig, PioTips, PioSelectorTip } from "../types/pio-tips";

/** Message priority levels (higher = more important) */
const PRIORITY = {
	IDLE: 1,
	HOVER: 8,
	CLICK: 8,
	CONSOLE: 9,
	COPY: 9,
	VisibilityChange: 9,
	HITOKOTO: 9,
	PHOTO: 9,
	WELCOME: 11,
} as const;

export class PioInteraction {
	private pioMessage: (text: string | string[], options?: { time?: number; html?: boolean }) => void;
	private actionBar: HTMLElement | null = null;
	private tips: PioTips | null = null;
	private config: PioInteractionConfig;
	private idleTimer: number | null = null;
	private idleInterval: number | null = null;
	private isUserActive = true;
	private messageTimer: number | null = null;
	private lastHoverSelector = "";
	private destroyed = false;
	private boundHandlers: Record<string, EventListener> = {};
	private hitokotoLoading = false;
	// 观察 .pio-action 子元素变化，等 Pio 按钮就绪后再添加自己的按钮
	private actionObserver: MutationObserver | null = null;
	// 新增按钮是否已添加
	private toolbarButtonsAdded = false;
	// Swup 页面切换回调引用（用于销毁时移除）
	private boundOnPageSwap: (() => void) | null = null;

	constructor(
		pioInstance: { message?: (text: string | string[], options?: { time?: number; html?: boolean }) => void },
		config: PioInteractionConfig,
	) {
		if (typeof pioInstance.message !== "function") {
			console.error("[PioInteraction] pioInstance.message is not a function. Check pio.js exposes message method.");
		}
		this.pioMessage = pioInstance.message?.bind(pioInstance) ?? (() => {});
		this.config = config;
		this.actionBar = document.querySelector(".pio-action");

		// 预绑定 onPageSwap，确保 add/remove 使用同一个引用
		this.boundOnPageSwap = this.onPageSwap.bind(this);
	}

	async init(): Promise<void> {
		console.log("[PioInteraction] init() called, tipsUrl:", this.config.tipsUrl);
		try {
			const response = await fetch(this.config.tipsUrl, { cache: "no-store" });
			if (!response.ok) throw new Error("Failed to load tips");
			this.tips = await response.json();
			console.log("[PioInteraction] Tips loaded, mouseover count:", this.tips?.mouseover?.length ?? 0);
		} catch (e) {
			console.warn("[PioInteraction] Failed to load tips JSON", e);
			return;
		}

		// 延迟欢迎词，等待 Pio 自身的欢迎词显示完毕后再覆盖
		if (this.config.enhancedWelcome) {
			setTimeout(() => this.showEnhancedWelcome(), 1500);
		}

		if (this.config.idleMessage) {
			this.setupIdleDetection();
		}

		this.setupSelectorTips();

		// 等待 Pio 创建完工具栏按钮后，添加我们自己的按钮
		this.setupActionObserver();

		if (this.config.consoleDetect) {
			this.setupConsoleDetection();
		}
		if (this.config.copyDetect) {
			this.setupCopyDetection();
		}
		if (this.config.visibilityChange) {
			this.setupVisibilityChange();
		}

		// 页面切换后重新绑定（使用 Swup 事件，而非 Astro 原生事件）
		if (this.boundOnPageSwap) {
			document.addEventListener("astro:after-swap", this.boundOnPageSwap);
			// 兼容 Swup：content:replace 在 DOM 替换后触发
			if (typeof window !== "undefined" && (window as any).swup) {
				(window as any).swup.hooks.on("content:replace", this.boundOnPageSwap);
			}
		}
	}

	// --- Core message system with priority ---

	showMessage(text: string | string[], priority: number = 1, duration: number = 3000, override: boolean = true, forceShow: boolean = false): void {
		if (this.destroyed) return;

		const currentPriority = parseInt(sessionStorage.getItem("waifu-text") || "0");

		// forceShow 为 true 时，强制显示消息，忽略优先级检查
		if (!forceShow) {
			if (
				!text ||
				(override && currentPriority > priority) ||
				(!override && currentPriority >= priority)
			)
				return;
		}

		const message = this.getRandomText(text);
		if (!message) return;

		sessionStorage.setItem("waifu-text", String(priority));

		if (typeof message === "string" && message.includes("<")) {
			this.pioMessage(message, { time: duration, html: true });
		} else {
			this.pioMessage(message, { time: duration });
		}

		if (this.messageTimer) {
			clearTimeout(this.messageTimer);
		}
		this.messageTimer = window.setTimeout(() => {
			const stored = parseInt(sessionStorage.getItem("waifu-text") || "0");
			if (stored <= priority) {
				sessionStorage.removeItem("waifu-text");
			}
		}, duration + 200);
	}

	// --- Enhanced welcome message ---

	private showEnhancedWelcome(): void {
		if (!this.tips) return;

		const referrer = document.referrer;
		if (referrer && !referrer.includes(window.location.origin)) {
			try {
				const refHost = new URL(referrer).hostname;
				const text = this.renderTemplate(this.tips.message.referrer, refHost);
				this.showMessage(text, PRIORITY.WELCOME, 7000);
				return;
			} catch {
				// Invalid referrer URL, fall through
			}
		}

		// 主页显示时段问候，其他页面显示欢迎词
		const isHome = window.location.pathname === "/" || window.location.pathname === "";
		if (isHome) {
			const greeting = this.getTimeGreeting();
			if (greeting) {
				this.showMessage(greeting, PRIORITY.WELCOME, 7000);
				return;
			}
		}

		const welcomeText = this.renderTemplate(this.tips.message.welcome, document.title);
		this.showMessage(welcomeText, PRIORITY.WELCOME, 7000);
	}

	// --- Idle detection ---

	private setupIdleDetection(): void {
		const activityHandler = () => {
			this.isUserActive = true;
			if (this.idleTimer) clearTimeout(this.idleTimer);
			if (this.idleInterval) {
				clearInterval(this.idleInterval);
				this.idleInterval = null;
			}
			this.idleTimer = window.setTimeout(() => {
				if (this.destroyed) return;
				this.isUserActive = false;
				this.startIdleMessages();
			}, this.config.idleTimeout || 20000);
		};

		const events = ["mousemove", "keydown", "scroll", "touchstart"];
		events.forEach((event) => {
			const handler = activityHandler.bind(null) as EventListener;
			this.boundHandlers[`idle_${event}`] = handler;
			document.addEventListener(event, handler, { passive: true });
		});

		this.idleTimer = window.setTimeout(() => {
			this.startIdleMessages();
		}, this.config.idleTimeout || 20000);
	}

	private startIdleMessages(): void {
		if (this.idleInterval || this.destroyed || !this.tips) return;

		this.idleInterval = window.setInterval(() => {
			if (this.destroyed || this.isUserActive) return;
			const pool = [...this.tips!.message.idle, ...this.getSeasonalMessages()];
			this.showMessage(pool, PRIORITY.IDLE, 4000);
		}, 15000);
	}

	// --- Selector tips (hover / click) ---

	private setupSelectorTips(): void {
		if (!this.tips) {
			console.warn("[PioInteraction] setupSelectorTips: tips not loaded");
			return;
		}

		console.log("[PioInteraction] setupSelectorTips: registering", this.tips.mouseover?.length ?? 0, "mouseover handlers");

		const setup = (items: PioSelectorTip[], defaultEvent: "mouseover" | "click") => {
			items.forEach((item) => {
				// 根据 JSON 中的 type 字段决定事件类型
				const eventType: "mouseover" | "click" =
					item.type === "click" ? "click" : defaultEvent;

				const handler = (e: Event) => {
					const target = (e.target as HTMLElement)?.closest(item.selector);
					if (!target) return;
					if (eventType === "mouseover" && this.lastHoverSelector === item.selector) return;
					if (eventType === "mouseover") {
						this.lastHoverSelector = item.selector;
						// 消息显示完毕后允许再次触发
						setTimeout(() => {
							if (this.lastHoverSelector === item.selector) {
								this.lastHoverSelector = "";
							}
						}, 4200);
					}

					let text = this.getRandomText(item.text);
					if (text) {
						const el = target as HTMLElement;
						let val1 = el.innerText;
						let val2 = el.getAttribute("href") || "";

						if (el.classList.contains("friend-card")) {
							const h3 = el.querySelector("h3");
							if (h3) val1 = h3.innerText.trim();
							const a = el.querySelector("a[href]");
							if (a) val2 = a.getAttribute("href") || "";
						}

						text = text.replace(/\{text\}/g, val1);
						text = text.replace(/\$1/g, val1);
						if (val2) {
							text = text.replace(/\$2/g, val2);
						}
						// 用户主动触发的交互（悬停、点击）强制显示，立即覆盖当前消息
						this.showMessage(text, PRIORITY.HOVER, 4000, true, true);
					}
				};
				document.addEventListener(eventType, handler, { passive: true });
				// 使用 | 分隔避免选择器中含 _ 导致解析错误
				this.boundHandlers[`selector|${eventType}|${item.selector}`] = handler;
			});
		};

		if (this.tips.mouseover) setup(this.tips.mouseover, "mouseover");
		if (this.tips.click) setup(this.tips.click, "click");
	}

	private removeSelectorTips(): void {
		Object.keys(this.boundHandlers)
			.filter((k) => k.startsWith("selector|"))
			.forEach((k) => {
				const parts = k.split("|");
				const eventType = parts[1] as "mouseover" | "click";
				const handler = this.boundHandlers[k];
				document.removeEventListener(eventType, handler);
				delete this.boundHandlers[k];
			});
	}

	// --- Console detection ---

	private setupConsoleDetection(): void {
		if (!this.tips) return;
		const self = this;

		let lastConsoleState = false; // 上一次检测的控制台状态
		let messageShown = false; // 本次打开是否已显示消息

		// Window size detection
		const checkDevTools = () => {
			const widthThreshold = window.outerWidth - window.innerWidth > 160;
			const heightThreshold = window.outerHeight - window.innerHeight > 160;
			const isOpen = widthThreshold || heightThreshold;

			// 检测到从关闭到打开的状态变化
			if (isOpen && !lastConsoleState && !messageShown) {
				if (!self.destroyed && self.tips) {
					self.showMessage(self.tips.message.console, PRIORITY.CONSOLE, 6000);
					messageShown = true;
				}
			}

			// 检测到控制台关闭，重置标志
			if (!isOpen && lastConsoleState) {
				messageShown = false;
			}

			lastConsoleState = isOpen;
		};

		// Check every 1 second for responsive detection
		const timer = window.setInterval(() => {
			if (self.destroyed) {
				clearInterval(timer);
				return;
			}
			checkDevTools();
		}, 1000);
	}

	// --- Copy detection ---

	private setupCopyDetection(): void {
		if (!this.tips) return;
		const handler = () => {
			if (!this.destroyed && this.tips) {
				this.showMessage(this.tips.message.copy, PRIORITY.COPY, 6000);
			}
		};
		window.addEventListener("copy", handler);
		this.boundHandlers["copy"] = handler;
	}

	// --- Visibility change ---

	private setupVisibilityChange(): void {
		if (!this.tips) return;
		const handler = () => {
			if (!document.hidden && !this.destroyed && this.tips) {
				this.showMessage(this.tips.message.visibilityChange, PRIORITY.VisibilityChange, 6000);
			}
		};
		document.addEventListener("visibilitychange", handler);
		this.boundHandlers["visibilitychange"] = handler;
	}

	// --- Hitokoto ---

	private async fetchHitokoto(): Promise<void> {
		if (this.hitokotoLoading || !this.tips) return;
		this.hitokotoLoading = true;

		try {
			const url = this.config.hitokotoUrl || "https://v1.hitokoto.cn/?c=a&c=b&c=d&c=i&c=k";
			const response = await fetch(url, { cache: "no-store" });
			if (!response.ok) throw new Error("Hitokoto API error");
			const data = await response.json();

			const quote = data.hitokoto || "";
			this.showMessage(quote, PRIORITY.HITOKOTO, 6000);

			if (data.from) {
				setTimeout(() => {
					const fromText = this.renderTemplate(this.tips!.message.hitokotoFrom, data.from || "", data.creator || "");
					this.showMessage(fromText, PRIORITY.HITOKOTO, 4000);
				}, 6500);
			}
		} catch {
			this.showMessage(this.tips.message.hitokotoError, PRIORITY.HITOKOTO, 3000);
		} finally {
			this.hitokotoLoading = false;
		}
	}

	// --- Photo / screenshot ---

	private takePhoto(): void {
		if (!this.tips) return;
		const canvas = document.getElementById("pio") as HTMLCanvasElement | null;
		if (!canvas) return;

		try {
			// 创建临时 canvas，合成 Live2D 画面（透明背景）
			const tmpCanvas = document.createElement("canvas");
			tmpCanvas.width = canvas.width;
			tmpCanvas.height = canvas.height;
			const ctx = tmpCanvas.getContext("2d");
			if (!ctx) return;

			// 直接把 Live2D canvas 叠加上去，保留透明背景
			ctx.drawImage(canvas, 0, 0);

			const dataUrl = tmpCanvas.toDataURL("image/png");
			const link = document.createElement("a");
			link.style.display = "none";
			link.href = dataUrl;
			link.download = "live2d-photo.png";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			const text = this.getRandomText(this.tips.message.photo);
			this.showMessage(text, PRIORITY.PHOTO, 3000);
			this.showFlashEffect();
		} catch {
			this.showMessage(this.tips.message.photoError, PRIORITY.PHOTO, 3000);
		}
	}

	private showFlashEffect(): void {
		const flash = document.createElement("div");
		flash.className = "pio-photo-flash";
		document.body.appendChild(flash);
		setTimeout(() => flash.remove(), 500);
	}

	// --- Toolbar buttons (add our own, don't override Pio's) ---

	private setupActionObserver(): void {
		if (!this.actionBar) return;

		// 断开旧 observer 避免页面切换后重复监听
		this.actionObserver?.disconnect();

		// 尝试立即添加（Pio 可能已经完成了按钮创建）
		if (this.tryAddToolbarButtons()) return;

		// Pio 的 action.buttons() 是异步的，会在 init 之后才执行，
		// 并且每次切换模型都会清空 innerHTML 重建。
		// 监听 .pio-action 的 childList 变化，等出现 .pio-close 后再添加我们的按钮。
		this.actionObserver = new MutationObserver(() => {
			this.tryAddToolbarButtons();
		});
		this.actionObserver.observe(this.actionBar, { childList: true });
	}

	/** 在 Pio 按钮就绪后添加我们自己的按钮。返回 true 表示已成功添加。 */
	private tryAddToolbarButtons(): boolean {
		if (this.destroyed || !this.actionBar) return false;

		// 检测 Pio 按钮是否已就绪（.pio-close 是 Pio 始终会创建 of 按钮）
		if (!this.actionBar.querySelector(".pio-close")) return false;

		// 避免重复添加
		if (this.toolbarButtonsAdded) return true;
		// 先断开 observer，避免我们添加按钮触发 of childList 变化导致重新进入此方法
		this.actionObserver?.disconnect();

		if (this.config.hitokoto) {
			const hitokotoBtn = document.createElement("span");
			hitokotoBtn.className = "pio-hitokoto";
			hitokotoBtn.title = "一言";
			hitokotoBtn.onclick = () => this.fetchHitokoto();
			hitokotoBtn.onmouseover = () => {
				this.showMessage(["猜猜我要说些什么？", "我从青蛙王子那里听到了不少人生经验。"], PRIORITY.HOVER, 3000, true, true);
			};
			this.actionBar.insertBefore(hitokotoBtn, this.actionBar.firstChild);
		}

		if (this.config.photo) {
			const photoBtn = document.createElement("span");
			photoBtn.className = "pio-photo";
			photoBtn.title = "拍照";
			photoBtn.onclick = () => this.takePhoto();
			photoBtn.onmouseover = () => {
				this.showMessage(["你要给我拍照呀？一二三～茄子～", "要不，我们来合影吧！", "保持微笑就好了～"], PRIORITY.HOVER, 3000, true, true);
			};
			this.actionBar.insertBefore(photoBtn, this.actionBar.firstChild);
		}

		this.toolbarButtonsAdded = true;

		// 继续监听，因为切换模型时 Pio 会清空 .pio-action 并重建按钮
		this.actionObserver?.disconnect();
		this.actionObserver = new MutationObserver(() => {
			if (this.destroyed) return;
			// 按钮被清空后需要重新添加
			this.toolbarButtonsAdded = false;
			this.tryAddToolbarButtons();
		});
		this.actionObserver.observe(this.actionBar, { childList: true });

		return true;
	}

	// --- Page swap re-binding ---

	private onPageSwap(): void {
		this.lastHoverSelector = "";
		this.removeSelectorTips();
		this.setupSelectorTips();

		if (this.config.enhancedWelcome && this.tips) {
			this.showEnhancedWelcome();
		}

		// 页面切换后重新查找 .pio-action
		// 注意：不要重置 toolbarButtonsAdded，因为 Pio 不会在页面切换时清空工具栏，
		// 我们已添加的按钮仍然在 DOM 中。只在 Pio 清空 innerHTML（模型切换）时才重新添加。
		const newActionBar = document.querySelector(".pio-action") as HTMLElement | null;
		if (newActionBar && newActionBar !== this.actionBar) {
			// DOM 元素变了（极少见），需要重新设置
			this.actionBar = newActionBar;
			this.toolbarButtonsAdded = false;
			this.setupActionObserver();
		} else {
			this.actionBar = newActionBar;
		}
	}

	// --- Template helpers ---

	private renderTemplate(template: string, ...args: string[]): string {
		return template.replace(/\$(\d+)/g, (_, index) => {
			const i = parseInt(index, 10) - 1;
			return args[i] !== undefined ? args[i] : "";
		});
	}

	private getRandomText(text: string | string[]): string {
		if (Array.isArray(text)) {
			return text[Math.floor(Math.random() * text.length)];
		}
		return text;
	}

	private getSeasonalMessages(): string[] {
		if (!this.tips) return [];
		const now = new Date();
		const results: string[] = [];

		for (const season of this.tips.seasons) {
			const parts = season.date.split("-");
			const after = parts[0].split("/");
			const before = parts.length > 1 ? parts[1].split("/") : after;

			const afterMonth = parseInt(after[0]);
			const afterDay = parseInt(after[1]);
			const beforeMonth = parseInt(before[0]);
			const beforeDay = parseInt(before[1]);

			const currentMonth = now.getMonth() + 1;
			const currentDay = now.getDate();

			if (
				currentMonth > afterMonth ||
				(currentMonth === afterMonth && currentDay >= afterDay)
			) {
				if (
					currentMonth < beforeMonth ||
					(currentMonth === beforeMonth && currentDay <= beforeDay)
				) {
					let text = this.getRandomText(season.text);
					text = text.replace(/\{year\}/g, String(now.getFullYear()));
					results.push(text);
				}
			}
		}

		return results;
	}

	private getTimeGreeting(): string | null {
		if (!this.tips) return null;

		const hour = new Date().getHours();
		for (const slice of this.tips.time) {
			const parts = slice.hour.split("-");
			const start = parseInt(parts[0]);
			const end = parseInt(parts[1] || parts[0]);

			if (hour >= start && hour <= end) {
				return this.getRandomText(slice.text);
			}
		}
		return null;
	}

	// --- Lifecycle ---

	destroy(): void {
		this.destroyed = true;

		// Clear timers
		if (this.idleTimer) clearTimeout(this.idleTimer);
		if (this.idleInterval) clearInterval(this.idleInterval);
		if (this.messageTimer) clearTimeout(this.messageTimer);

		// Disconnect action observer
		if (this.actionObserver) {
			this.actionObserver.disconnect();
			this.actionObserver = null;
		}

		// Remove all event listeners
		Object.entries(this.boundHandlers).forEach(([key, handler]) => {
			if (key.startsWith("idle_")) {
				const eventType = key.replace("idle_", "");
				document.removeEventListener(eventType, handler);
			} else if (key === "copy") {
				window.removeEventListener("copy", handler);
			} else if (key === "visibilitychange") {
				document.removeEventListener("visibilitychange", handler);
			} else if (key.startsWith("selector|")) {
				const parts = key.split("|");
				const eventType = parts[1] as "mouseover" | "click";
				document.removeEventListener(eventType, handler);
			}
		});

		// Remove page swap listeners（使用预绑定的引用）
		if (this.boundOnPageSwap) {
			document.removeEventListener("astro:after-swap", this.boundOnPageSwap);
			if (typeof window !== "undefined" && (window as any).swup) {
				(window as any).swup.hooks.off("content:replace", this.boundOnPageSwap);
			}
			this.boundOnPageSwap = null;
		}

		// Remove toolbar buttons
		const hitokotoBtn = this.actionBar?.querySelector(".pio-hitokoto");
		const photoBtn = this.actionBar?.querySelector(".pio-photo");
		if (hitokotoBtn) hitokotoBtn.remove();
		if (photoBtn) photoBtn.remove();

		// Clear sessionStorage priority
		sessionStorage.removeItem("waifu-text");
	}
}