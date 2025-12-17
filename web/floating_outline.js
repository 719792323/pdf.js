/* Copyright 2024 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * 浮动书签面板类
 * 支持从侧边栏拖拽出来、自由调整大小、以及关闭后返回侧边栏
 */
class FloatingOutline {
  #container = null;
  #header = null;
  #content = null;
  #closeButton = null;
  #resizers = [];
  #contextMenu = null;
  #viewerContainer = null;
  #hasInitializedContent = false;
  #followMouseToggleButton = null;

  #isDragging = false;
  #isResizing = false;
  #currentResizer = null;

  #startX = 0;
  #startY = 0;
  #startWidth = 0;
  #startHeight = 0;
  #startLeft = 0;
  #startTop = 0;

  #originalOutlineParent = null;
  #outlineView = null;
  #eventBus = null;
  #isFloating = false;

  // 最小尺寸
  #minWidth = 200;
  #minHeight = 150;

  // 保存用户调整的尺寸和位置
  #savedWidth = null;
  #savedHeight = null;
  #savedLeft = null;
  #savedTop = null;
  #hasSavedState = false;

  // 是否跟随鼠标位置显示书签
  #followMouse = false;

  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - 浮动面板容器
   * @param {HTMLElement} options.outlineView - 大纲视图元素
   * @param {Object} options.eventBus - 事件总线
   */
  constructor({ container, outlineView, eventBus, viewerContainer, followMouseToggleButton }) {
    this.#container = container;
    this.#outlineView = outlineView;
    this.#eventBus = eventBus;
    this.#viewerContainer = viewerContainer;
    this.#followMouseToggleButton = followMouseToggleButton;

    this.#header = container.querySelector(".floatingOutlineHeader");
    this.#content = container.querySelector(".floatingOutlineContent");
    this.#closeButton = container.querySelector(".floatingOutlineCloseButton");
    this.#resizers = container.querySelectorAll(".floatingOutlineResizer");

    // 创建右键菜单
    this.#createContextMenu();
    this.#setupEventListeners();
    this.#updateFollowMouseButtonState();
  }

  /**
   * 创建右键菜单（书签面板上的）
   */
  #createContextMenu() {
    this.#contextMenu = document.createElement("div");
    this.#contextMenu.className = "floatingOutlineContextMenu hidden";
    this.#updateContextMenuContent();
    document.body.appendChild(this.#contextMenu);
  }

  /**
   * 更新右键菜单内容
   */
  #updateContextMenuContent() {
    // const followMouseText = this.#followMouse ? "✓ 鼠标跟随" : "○ 鼠标跟随";
    this.#contextMenu.innerHTML = `
      <div class="contextMenuItem" data-action="collapseAll">全部收起</div>
      <div class="contextMenuItem" data-action="hide">隐藏书签</div>
    `;
  }



  #setupEventListeners() {
    // 关闭按钮
    this.#closeButton?.addEventListener("click", () => this.close());

    // 拖拽功能
    this.#header?.addEventListener("mousedown", this.#onDragStart.bind(this));

    // 调整大小功能
    this.#resizers.forEach(resizer => {
      resizer.addEventListener("mousedown", this.#onResizeStart.bind(this));
    });

    // 全局事件监听
    document.addEventListener("mousemove", this.#onMouseMove.bind(this));
    document.addEventListener("mouseup", this.#onMouseUp.bind(this));

    // 监听侧边栏中书签按钮的双击事件，触发浮动
    this.#eventBus?._on("popoutoutline", () => this.popOut());

    // 右键菜单事件（书签面板）
    this.#container?.addEventListener("contextmenu", this.#onContextMenu.bind(this));
    this.#contextMenu?.addEventListener("click", this.#onContextMenuClick.bind(this));
    document.addEventListener("click", this.#hideContextMenu.bind(this));

    // PDF区域右键直接切换书签显示/隐藏
    this.#viewerContainer?.addEventListener("contextmenu", this.#onPdfContextMenu.bind(this));

    // 监听双击PDF切换书签显示，传递鼠标位置
    this.#eventBus?._on("togglefloatingoutline", ({ mouseX, mouseY }) => this.toggle(mouseX, mouseY));

    // 监听新PDF加载事件，重置书签内容
    this.#eventBus?._on("documentloaded", () => this.#onDocumentLoaded());

    // 工具栏按钮点击事件
    this.#followMouseToggleButton?.addEventListener("click", () => this.#toggleFollowMouse());
  }

  /**
   * 切换跟随鼠标功能
   */
  #toggleFollowMouse() {
    this.#followMouse = !this.#followMouse;
    this.#updateFollowMouseButtonState();
  }

  /**
   * 更新工具栏按钮状态
   */
  #updateFollowMouseButtonState() {
    if (this.#followMouseToggleButton) {
      if (this.#followMouse) {
        this.#followMouseToggleButton.classList.add("toggled");
        this.#followMouseToggleButton.title = "书签跟随鼠标（已开启）";
      } else {
        this.#followMouseToggleButton.classList.remove("toggled");
        this.#followMouseToggleButton.title = "书签跟随鼠标（已关闭）";
      }
    }
  }

  /**
   * 新PDF文档加载时重置书签内容
   */
  #onDocumentLoaded() {
    // 重置初始化标志，下次打开时会重新克隆书签内容
    this.#hasInitializedContent = false;
    // 清空当前浮动面板内容
    if (this.#content) {
      this.#content.innerHTML = "";
    }
    // 如果当前正在显示，则关闭
    if (this.#isFloating) {
      this.close();
    }
  }

  /**
   * 显示右键菜单
   */
  #onContextMenu(e) {
    e.preventDefault();
    // 先显示菜单以获取尺寸
    this.#contextMenu.classList.remove("hidden");
    // 获取菜单尺寸
    const menuWidth = this.#contextMenu.offsetWidth;
    const menuHeight = this.#contextMenu.offsetHeight;
    // 让鼠标位于菜单中心
    this.#contextMenu.style.left = `${e.clientX - menuWidth / 2}px`;
    this.#contextMenu.style.top = `${e.clientY - menuHeight / 2}px`;
  }

  /**
   * 隐藏右键菜单
   */
  #hideContextMenu() {
    this.#contextMenu?.classList.add("hidden");
  }

  /**
   * PDF区域右键直接切换书签显示/隐藏
   */
  #onPdfContextMenu(e) {
    // 如果点击在浮动书签面板上，不处理
    if (e.target.closest("#floatingOutlineContainer")) {
      return;
    }
    e.preventDefault();
    // 直接切换书签显示/隐藏，在鼠标位置显示
    this.toggle(e.clientX, e.clientY);
  }

  /**
   * 右键菜单点击处理
   */
  #onContextMenuClick(e) {
    const action = e.target.dataset.action;
    if (action === "toggleFollowMouse") {
      this.#followMouse = !this.#followMouse;
      this.#updateContextMenuContent();
    } else if (action === "collapseAll") {
      this.#collapseAll();
    } else if (action === "hide") {
      this.close();
    }
    this.#hideContextMenu();
  }

  /**
   * 全部收起书签
   */
  #collapseAll() {
    const togglers = this.#content?.querySelectorAll(".treeItemToggler");
    togglers?.forEach(toggler => {
      if (!toggler.classList.contains("treeItemsHidden")) {
        toggler.classList.add("treeItemsHidden");
      }
    });
  }

  /**
   * 切换浮动面板显示/隐藏
   * @param {number} mouseX - 鼠标X坐标
   * @param {number} mouseY - 鼠标Y坐标
   */
  toggle(mouseX, mouseY) {
    if (this.#isFloating) {
      this.close();
    } else {
      this.popOut(mouseX, mouseY);
    }
  }

  /**
   * 将书签面板弹出为浮动窗口
   * @param {number} mouseX - 鼠标X坐标（可选）
   * @param {number} mouseY - 鼠标Y坐标（可选）
   */
  popOut(mouseX, mouseY) {
    if (this.#isFloating) {
      return;
    }

    // 检查是否需要初始化或更新内容
    // 条件：有原始书签视图，有内容区域，并且（未初始化过 或者 浮动面板内容为空但原始视图有内容）
    const outlineHasContent = this.#outlineView?.querySelector(".treeItem");
    const floatingContentIsEmpty = !this.#content?.querySelector(".treeItem");
    const needsUpdate = !this.#hasInitializedContent || (floatingContentIsEmpty && outlineHasContent);

    if (needsUpdate && this.#outlineView && this.#content && outlineHasContent) {
      // 保存原始父元素
      this.#originalOutlineParent = this.#outlineView?.parentElement;

      // 克隆书签视图内容到浮动面板
      const clonedContent = this.#outlineView.cloneNode(true);
      clonedContent.classList.remove("hidden");
      clonedContent.id = "floatingOutlineViewContent";
      this.#content.innerHTML = "";
      this.#content.appendChild(clonedContent);

      // 重新绑定点击事件
      this.#bindOutlineLinks(clonedContent);
      this.#hasInitializedContent = true;
    }

    // 显示浮动面板
    this.#container.classList.remove("hidden");
    this.#container.classList.add("visible");
    this.#isFloating = true;

    // 使用保存的尺寸或默认尺寸
    const panelWidth = this.#hasSavedState ? this.#savedWidth : 300;
    const panelHeight = this.#hasSavedState ? this.#savedHeight : 400;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left, top;

    // 如果开启了跟随鼠标且提供了鼠标位置，则面板出现在鼠标位置（鼠标在面板中心）
    if (this.#followMouse && mouseX !== undefined && mouseY !== undefined) {
      left = mouseX - panelWidth / 2;
      top = mouseY - panelHeight / 2;
    } else if (this.#hasSavedState) {
      // 如果有保存的位置，使用保存的位置
      left = this.#savedLeft;
      top = this.#savedTop;
    } else {
      // 默认位置：屏幕中心偏右
      left = (viewportWidth - panelWidth) / 2 + 200;
      top = (viewportHeight - panelHeight) / 2;
    }

    // 确保面板不超出视口边界
    left = Math.max(10, Math.min(left, viewportWidth - panelWidth - 10));
    top = Math.max(10, Math.min(top, viewportHeight - panelHeight - 10));

    this.#container.style.left = `${left}px`;
    this.#container.style.top = `${top}px`;
    this.#container.style.width = `${panelWidth}px`;
    this.#container.style.height = `${panelHeight}px`;

    this.#eventBus?.dispatch("floatingoutlineopened", { source: this });
  }

  /**
   * 重新绑定书签链接点击事件
   * 因为克隆节点不会复制事件监听器，所以需要重新绑定
   */
  #bindOutlineLinks(container) {
    const clonedLinks = container.querySelectorAll("a");
    const originalLinks = this.#outlineView?.querySelectorAll("a") || [];

    clonedLinks.forEach((clonedLink, index) => {
      const originalLink = originalLinks[index];
      if (originalLink) {
        clonedLink.addEventListener("click", e => {
          e.preventDefault();
          // 模拟点击原始链接来触发正确的导航
          originalLink.click();

          // 如果该书签有子项，则自动展开
          const parentTreeItem = clonedLink.closest(".treeItem");
          if (parentTreeItem) {
            const toggler = parentTreeItem.querySelector(":scope > .treeItemToggler");
            // 如果存在展开按钮且当前是折叠状态，则展开
            if (toggler && toggler.classList.contains("treeItemsHidden")) {
              toggler.classList.remove("treeItemsHidden");
            }

            // 展开后，将被点击的书签滚动到面板可视区域中间偏上的位置
            setTimeout(() => {
              const contentContainer = this.#content;
              if (contentContainer) {
                const linkRect = clonedLink.getBoundingClientRect();
                const containerRect = contentContainer.getBoundingClientRect();
                // 计算目标位置：中间偏上（容器高度的1/3处）
                const targetOffset = containerRect.height / 4;
                const scrollTop = contentContainer.scrollTop + (linkRect.top - containerRect.top) - targetOffset;
                contentContainer.scrollTo({
                  top: Math.max(0, scrollTop),
                  behavior: "smooth",
                });
              }
            }, 50);
          }
        });
      }
    });

    // 绑定展开/折叠按钮
    const togglers = container.querySelectorAll(".treeItemToggler");
    togglers.forEach(toggler => {
      toggler.addEventListener("click", () => {
        toggler.classList.toggle("treeItemsHidden");
      });
    });
  }

  /**
   * 关闭浮动面板（隐藏，但保持内容和展开状态）
   */
  close() {
    if (!this.#isFloating) {
      return;
    }

    // 保存当前尺寸和位置，以便下次显示时使用
    this.#savedWidth = this.#container.offsetWidth;
    this.#savedHeight = this.#container.offsetHeight;
    this.#savedLeft = this.#container.offsetLeft;
    this.#savedTop = this.#container.offsetTop;
    this.#hasSavedState = true;

    // 隐藏浮动面板，但不清空内容，保持展开状态
    this.#container.classList.add("hidden");
    this.#container.classList.remove("visible");
    this.#isFloating = false;

    this.#eventBus?.dispatch("floatingoutlineclosed", { source: this });
  }

  /**
   * 开始拖拽
   */
  #onDragStart(e) {
    if (e.target.closest(".floatingOutlineCloseButton")) {
      return;
    }

    this.#isDragging = true;
    this.#startX = e.clientX;
    this.#startY = e.clientY;
    this.#startLeft = this.#container.offsetLeft;
    this.#startTop = this.#container.offsetTop;

    this.#container.classList.add("dragging");
    e.preventDefault();
  }

  /**
   * 开始调整大小
   */
  #onResizeStart(e) {
    this.#isResizing = true;
    this.#currentResizer = e.target;
    this.#startX = e.clientX;
    this.#startY = e.clientY;
    this.#startWidth = this.#container.offsetWidth;
    this.#startHeight = this.#container.offsetHeight;
    this.#startLeft = this.#container.offsetLeft;
    this.#startTop = this.#container.offsetTop;

    this.#container.classList.add("resizing");
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * 鼠标移动处理
   */
  #onMouseMove(e) {
    if (this.#isDragging) {
      const dx = e.clientX - this.#startX;
      const dy = e.clientY - this.#startY;

      let newLeft = this.#startLeft + dx;
      let newTop = this.#startTop + dy;

      // 限制在窗口范围内
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - this.#container.offsetWidth));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - this.#container.offsetHeight));

      this.#container.style.left = `${newLeft}px`;
      this.#container.style.top = `${newTop}px`;
    }

    if (this.#isResizing && this.#currentResizer) {
      const dx = e.clientX - this.#startX;
      const dy = e.clientY - this.#startY;
      const direction = this.#currentResizer.dataset.direction;

      let newWidth = this.#startWidth;
      let newHeight = this.#startHeight;
      let newLeft = this.#startLeft;
      let newTop = this.#startTop;

      // 根据方向调整大小
      if (direction.includes("e")) {
        newWidth = Math.max(this.#minWidth, this.#startWidth + dx);
      }
      if (direction.includes("w")) {
        newWidth = Math.max(this.#minWidth, this.#startWidth - dx);
        if (newWidth > this.#minWidth) {
          newLeft = this.#startLeft + dx;
        }
      }
      if (direction.includes("s")) {
        newHeight = Math.max(this.#minHeight, this.#startHeight + dy);
      }
      if (direction.includes("n")) {
        newHeight = Math.max(this.#minHeight, this.#startHeight - dy);
        if (newHeight > this.#minHeight) {
          newTop = this.#startTop + dy;
        }
      }

      this.#container.style.width = `${newWidth}px`;
      this.#container.style.height = `${newHeight}px`;
      this.#container.style.left = `${newLeft}px`;
      this.#container.style.top = `${newTop}px`;
    }
  }

  /**
   * 鼠标松开处理
   */
  #onMouseUp() {
    if (this.#isDragging) {
      this.#isDragging = false;
      this.#container.classList.remove("dragging");
    }

    if (this.#isResizing) {
      this.#isResizing = false;
      this.#currentResizer = null;
      this.#container.classList.remove("resizing");
    }
  }

  /**
   * 检查是否处于浮动状态
   */
  get isFloating() {
    return this.#isFloating;
  }

  /**
   * 销毁实例
   */
  destroy() {
    document.removeEventListener("mousemove", this.#onMouseMove.bind(this));
    document.removeEventListener("mouseup", this.#onMouseUp.bind(this));
  }
}

export { FloatingOutline };
