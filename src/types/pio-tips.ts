/** 交互提示 JSON 的时段问候 */
export type PioTimeSlice = {
	/** 时段范围，如 "0-5"、"6-7"、"8-11" */
	hour: string;
	/** 消息文本，可以是单条或数组随机选取 */
	text: string | string[];
};

/** 交互提示 JSON 的节日消息 */
export type PioSeasonMessage = {
	/** 日期范围，"MM/DD" 或 "MM/DD-MM/DD" */
	date: string;
	/** 消息文本，{year} 替换为当前年份 */
	text: string;
};

/** 交互提示 JSON 的 CSS 选择器悬停/点击提示 */
export type PioSelectorTip = {
	/** CSS 选择器 */
	selector: string;
	/** 交互类型 */
	type: "read" | "link" | "hover" | "click";
	/** 消息文本，$1 替换为元素文本，$2 替换为元素链接 */
	text: string | string[];
};

/** 交互提示 JSON 的系统事件消息 */
export type PioEventMessages = {
	/** 闲置时随机显示的消息 */
	idle: string[];
	/** 打开开发者工具时显示 */
	console: string;
	/** 复制文本时显示 */
	copy: string;
	/** 标签页切回时显示 */
	visibilityChange: string;
	/** 一言 API 错误时显示 */
	hitokotoError: string;
	/** 一言来源模板，$1 为来源，$2 为投稿者 */
	hitokotoFrom: string;
	/** 拍照成功时显示 */
	photo: string;
	/** 拍照失败时显示 */
	photoError: string;
	/** 来路检测模板，$1 为来源域名 */
	referrer: string;
	/** 欢迎模板，$1 为页面标题 */
	welcome: string;
};

/** 完整的交互提示 JSON 结构 */
export type PioTips = {
	/** 时段问候 */
	time: PioTimeSlice[];
	/** 节日消息 */
	seasons: PioSeasonMessage[];
	/** 鼠标悬停提示 */
	mouseover: PioSelectorTip[];
	/** 鼠标点击提示 */
	click?: PioSelectorTip[];
	/** 系统事件消息 */
	message: PioEventMessages;
};

/** 交互层配置 */
export type PioInteractionConfig = {
	/** 是否启用交互层 */
	enable: boolean;
	/** 提示 JSON 文件路径 */
	tipsUrl: string;
	/** 闲置超时（毫秒），默认 20000 */
	idleTimeout?: number;
	/** 是否启用一言按钮 */
	hitokoto?: boolean;
	/** 一言 API 地址 */
	hitokotoUrl?: string;
	/** 是否启用拍照按钮 */
	photo?: boolean;
	/** 是否启用控制台检测 */
	consoleDetect?: boolean;
	/** 是否启用标签页切换提示 */
	visibilityChange?: boolean;
	/** 是否启用复制检测 */
	copyDetect?: boolean;
	/** 是否启用增强欢迎词 */
	enhancedWelcome?: boolean;
	/** 是否启用闲置消息 */
	idleMessage?: boolean;
};