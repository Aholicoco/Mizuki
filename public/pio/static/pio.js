/* ----

# Pio Plugin
# By: Dreamer-Paul
# Last Update: 2022.8.12

一个支持更换 Live2D 模型的 JS 插件

本代码为奇趣保罗原创，并遵守 GPL 2.0 开源协议。欢迎访问我的博客：https://paugram.com

---- */

var Paul_Pio = function (prop) {
	const current = {
		modelIndex: 0,
		outfitIndex: 0,
		timeout: undefined,
		menu: document.querySelector(".pio-container .pio-action"),
		canvas: document.getElementById("pio"),
		body: document.querySelector(".pio-container"),
		root: document.location.origin + "/",
		registryUrl: prop.registry || "/pio/models/registry.json",
		modelsBaseUrl: null,
		registry: null,
		models: [],
	};

	const tools = {
		create: (tag, options) => {
			const el = document.createElement(tag);
			options.class && (el.className = options.class);
			return el;
		},
		rand: (arr) => {
			return arr[Math.floor(Math.random() * arr.length + 1) - 1];
		},
		isMobile: () => {
			let ua = window.navigator.userAgent.toLowerCase();
			ua = ua.indexOf("mobile") || ua.indexOf("android") || ua.indexOf("ios");

			return window.innerWidth < 500 || ua !== -1;
		},
		getCurrentModel: () => current.models[current.modelIndex] || null,
		getCurrentOutfit: () => {
			const model = tools.getCurrentModel();
			return model && model.outfits ? model.outfits[current.outfitIndex] || null : null;
		},
		hasMultipleModels: () => current.models.length > 1,
		hasMultipleOutfits: () => {
			const model = tools.getCurrentModel();
			return !!(model && model.outfits && model.outfits.length > 1);
		},
		resolveUrl: (target, base) => new URL(target, base || document.location.href).toString(),
		getGeneratedModelPath: (modelId, outfitId) =>
			tools.resolveUrl(`${modelId}/generated/${outfitId}.json`, current.modelsBaseUrl),
	};

	const elements = {
		home: tools.create("span", { class: "pio-home" }),
		model: tools.create("span", { class: "pio-model" }),
		skin: tools.create("span", { class: "pio-skin" }),
		info: tools.create("span", { class: "pio-info" }),
		night: tools.create("span", { class: "pio-night" }),
		close: tools.create("span", { class: "pio-close" }),
		dialog: tools.create("div", { class: "pio-dialog" }),
		show: tools.create("div", { class: "pio-show" }),
	};

	current.body.appendChild(elements.dialog);
	current.body.appendChild(elements.show);

	const modules = {
		message: (text, options = {}) => {
			const { dialog } = elements;

			if (text && text.constructor === Array) {
				dialog.innerText = tools.rand(text);
			} else if (text && text.constructor === String) {
				dialog[options.html ? "innerHTML" : "innerText"] = text;
			} else {
				dialog.innerText = "输入内容出现问题了 X_X";
			}

			dialog.classList.add("active");

			current.timeout = clearTimeout(current.timeout) || undefined;
			current.timeout = setTimeout(() => {
				dialog.classList.remove("active");
			}, options.time || 3000);
		},
		destroy: () => {
			this.initHidden();
			localStorage.setItem("posterGirl", "0");
		},
		loadModel: async (modelIndex, outfitIndex, options = {}) => {
			if (!current.models.length) return;

			const nextModelIndex =
				typeof modelIndex === "number" ? modelIndex : current.modelIndex;
			const nextModel = current.models[nextModelIndex];

			if (!nextModel || !nextModel.outfits || !nextModel.outfits.length) return;

			const nextOutfitIndex =
				typeof outfitIndex === "number" ? outfitIndex : current.outfitIndex;
			const nextOutfit = nextModel.outfits[nextOutfitIndex];

			if (!nextOutfit) return;

			current.modelIndex = nextModelIndex;
			current.outfitIndex = nextOutfitIndex;

			if (nextOutfit.model) {
				loadlive2d("pio", nextOutfit.model);
			} else if (nextModel.id && nextOutfit.id) {
				loadlive2d(
					"pio",
					tools.getGeneratedModelPath(nextModel.id, nextOutfit.id),
				);
			} else {
				throw new Error("Outfit model config is invalid.");
			}

			if (options.message) {
				modules.message(options.message);
			}
		},
		switchModel: async () => {
			if (!tools.hasMultipleModels()) return;

			const nextIndex =
				current.modelIndex < current.models.length - 1 ? current.modelIndex + 1 : 0;
			await modules.loadModel(nextIndex, 0, {
				message:
					(prop.content.model && prop.content.model[1]) || "模型已经切换啦！",
			});
			action.buttons();
		},
		switchOutfit: async () => {
			const model = tools.getCurrentModel();
			if (!model || !model.outfits || model.outfits.length <= 1) {
				modules.message("当前模型没有可切换的服装。");
				return;
			}

			const nextIndex =
				current.outfitIndex < model.outfits.length - 1 ? current.outfitIndex + 1 : 0;
			await modules.loadModel(current.modelIndex, nextIndex, {
				message:
					(prop.content.skin && prop.content.skin[1]) || "新衣服真漂亮~",
			});
		},
		normalizeLegacyModels: () => {
			const legacyModels = Array.isArray(prop.model) ? prop.model : [];
			if (!legacyModels.length) return [];

			return [
				{
					id: "legacy",
					name: "默认模型",
					outfits: legacyModels.map((modelPath, index) => ({
						id: "legacy-" + index,
						name: "服装 " + (index + 1),
						model: modelPath,
					})),
				},
			];
		},
		loadRegistry: async () => {
			try {
				const response = await fetch(current.registryUrl, { cache: "no-store" });
				if (!response.ok) throw new Error("Registry request failed");

				const registry = await response.json();
				const modelIds = Array.isArray(registry.models) ? registry.models : [];
				const models = [];
				current.modelsBaseUrl = tools.resolveUrl("./", current.registryUrl);

				for (const modelId of modelIds) {
					const manifestUrl = tools.resolveUrl(
						`${modelId}/manifest.json`,
						current.modelsBaseUrl,
					);
					const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
					if (!manifestResponse.ok) continue;

					const manifest = await manifestResponse.json();
					const outfits = Array.isArray(manifest.outfits) ? manifest.outfits : [];

					if (!outfits.length) continue;

					models.push({
						id: manifest.id || modelId,
						name: manifest.name || modelId,
						outfits: outfits.map((outfit, index) => ({
							id: outfit.id || "outfit-" + index,
							name: outfit.name || "服装 " + (index + 1),
							model: outfit.model || null,
						})),
					});
				}

				current.registry = registry;
				current.models = models;

				const defaultModelId = registry.defaultModel;
				const defaultModelIndex = models.findIndex((item) => item.id === defaultModelId);
				if (defaultModelIndex >= 0) {
					current.modelIndex = defaultModelIndex;
				}
			} catch (error) {
				console.warn("Pio registry load failed, fallback to legacy models.", error);
				current.models = modules.normalizeLegacyModels();
			}

			if (!current.models.length) {
				current.models = modules.normalizeLegacyModels();
			}
		},
	};

	this.destroy = modules.destroy;
	this.message = modules.message;

	const action = {
		welcome: () => {
			if (document.referrer && document.referrer.includes(current.root)) {
				const referrer = document.createElement("a");
				referrer.href = document.referrer;

				if (prop.content.referer) {
					modules.message(
						prop.content.referer.replace(/%t/, `“${referrer.hostname}”`),
					);
				} else {
					modules.message(`欢迎来自 “${referrer.hostname}” 的朋友！`);
				}
			} else if (prop.tips) {
				let text,
					hour = new Date().getHours();

				if (hour > 22 || hour <= 5) {
					text = "你是夜猫子呀？这么晚还不睡觉，明天起的来嘛";
				} else if (hour > 5 && hour <= 8) {
					text = "早上好！";
				} else if (hour > 8 && hour <= 11) {
					text = "上午好！工作顺利嘛，不要久坐，多起来走动走动哦！";
				} else if (hour > 11 && hour <= 14) {
					text = "中午了，工作了一个上午，现在是午餐时间！";
				} else if (hour > 14 && hour <= 17) {
					text = "午后很容易犯困呢，今天的运动目标完成了吗？";
				} else if (hour > 17 && hour <= 19) {
					text = "傍晚了！窗外夕阳的景色很美丽呢，最美不过夕阳红~";
				} else if (hour > 19 && hour <= 21) {
					text = "晚上好，今天过得怎么样？";
				} else if (hour > 21 && hour <= 23) {
					text = "已经这么晚了呀，早点休息吧，晚安~";
				} else {
					text = "奇趣保罗说：这个是无法被触发的吧，哈哈";
				}

				modules.message(text);
			} else {
				modules.message(prop.content.welcome || "欢迎来到本站！");
			}
		},
		touch: () => {
			current.canvas.onclick = () => {
				modules.message(
					prop.content.touch || [
						"你在干什么？",
						"再摸我就报警了！",
						"HENTAI!",
						"不可以这样欺负我啦！",
					],
				);
			};
		},
		buttons: () => {
			current.menu.innerHTML = "";

			elements.home.onclick = () => {
				if (typeof window !== "undefined" && window.swup) {
					try {
						window.swup.navigate("/");
					} catch (error) {
						console.error("Swup navigation failed:", error);
						location.href = current.root;
					}
				} else {
					location.href = current.root;
				}
			};
			elements.home.onmouseover = () => {
				modules.message(prop.content.home || "点击这里回到首页！");
			};
			current.menu.appendChild(elements.home);

			if (tools.hasMultipleModels()) {
				elements.model.onclick = () => {
					modules.switchModel().catch((error) => {
						console.error("Pio model switch failed:", error);
					});
				};
				elements.model.onmouseover = () => {
					modules.message(
						(prop.content.model && prop.content.model[0]) || "想看看其他模型吗？",
					);
				};
				current.menu.appendChild(elements.model);
			}

			if (tools.hasMultipleOutfits()) {
				elements.skin.onclick = () => {
					modules.switchOutfit().catch((error) => {
						console.error("Pio outfit switch failed:", error);
					});
				};
				elements.skin.onmouseover = () => {
					modules.message(
						(prop.content.skin && prop.content.skin[0]) || "想看看我的新衣服吗？",
					);
				};
				current.menu.appendChild(elements.skin);
			}

			elements.info.onclick = () => {
				window.open(
					prop.content.link ||
						"https://paugram.com/coding/add-poster-girl-with-plugin.html",
				);
			};
			elements.info.onmouseover = () => {
				modules.message("想了解更多关于我的信息吗？");
			};
			current.menu.appendChild(elements.info);

			if (prop.night) {
				elements.night.onclick = () => {
					typeof prop.night === "function" ? prop.night() : eval(prop.night);
				};
				elements.night.onmouseover = () => {
					modules.message("夜间点击这里可以保护眼睛呢");
				};
				current.menu.appendChild(elements.night);
			}

			elements.close.onclick = () => {
				modules.destroy();
			};
			elements.close.onmouseover = () => {
				modules.message(prop.content.close || "QWQ 下次再见吧~");
			};
			current.menu.appendChild(elements.close);
		},
		custom: () => {
			prop.content.custom.forEach((item) => {
				const el = document.querySelectorAll(item.selector);

				if (!el.length) return;

				for (let i = 0; i < el.length; i++) {
					if (item.type === "read") {
						el[i].onmouseover = (ev) => {
							const text = ev.currentTarget.title || ev.currentTarget.innerText;
							modules.message("想阅读 %t 吗？".replace(/%t/, "“" + text + "”"));
						};
					} else if (item.type === "link") {
						el[i].onmouseover = (ev) => {
							const text = ev.currentTarget.title || ev.currentTarget.innerText;
							modules.message(
								"想了解一下 %t 吗？".replace(/%t/, "“" + text + "”"),
							);
						};
					} else if (item.text) {
						el[i].onmouseover = () => {
							modules.message(item.text);
						};
					}
				}
			});
		},
	};

	const begin = {
		static: () => {
			current.body.classList.add("static");
		},
		fixed: () => {
			action.touch();
			action.buttons();
		},
		draggable: () => {
			action.touch();
			action.buttons();

			const body = current.body;
			const location = {
				x: 0,
				y: 0,
			};

			const mousedown = (ev) => {
				const { offsetLeft, offsetTop } = ev.currentTarget;

				location.x = ev.clientX - offsetLeft;
				location.y = ev.clientY - offsetTop;

				document.addEventListener("mousemove", mousemove);
				document.addEventListener("mouseup", mouseup);
			};

			const mousemove = (ev) => {
				body.classList.add("active");
				body.classList.remove("right");

				body.style.left = ev.clientX - location.x + "px";
				body.style.top = ev.clientY - location.y + "px";
				body.style.bottom = "auto";
			};

			const mouseup = () => {
				body.classList.remove("active");
				document.removeEventListener("mousemove", mousemove);
			};

			body.onmousedown = mousedown;
		},
	};

	this.init = async (noModel) => {
		if (prop.hidden && tools.isMobile()) return;

		await modules.loadRegistry();

		if (!current.models.length) {
			modules.message("看板娘模型配置不存在。");
			return;
		}

		if (!noModel) {
			action.welcome();
			await modules.loadModel(current.modelIndex, current.outfitIndex);
		}

		switch (prop.mode) {
			case "static":
				begin.static();
				break;
			case "fixed":
				begin.fixed();
				break;
			case "draggable":
				begin.draggable();
				break;
		}

		prop.content.custom && action.custom();
	};

	this.initHidden = () => {
		if (prop.mode === "draggable") {
			current.body.style.top = null;
			current.body.style.left = null;
			current.body.style.bottom = null;
		}

		current.body.classList.add("hidden");
		elements.dialog.classList.remove("active");

		elements.show.onclick = () => {
			current.body.classList.remove("hidden");
			localStorage.setItem("posterGirl", "1");
			this.init();
		};
	};

	localStorage.getItem("posterGirl") === "0" ? this.initHidden() : this.init();
};

if (window.console && window.console.log) {
	console.log(
		"%c Pio %c https://paugram.com ",
		"color: #fff; margin: 1em 0; padding: 5px 0; background: #673ab7;",
		"margin: 1em 0; padding: 5px 0; background: #efefef;",
	);
}
