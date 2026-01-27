// ==UserScript==
// @name         Temu服装活动报名（价格填充+取消勾选）
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  仅点击按钮填充申报价格（无对应货号默认填999）+取消含价格提示的商品勾选（按钮移至右上角）
// @author       悟
// @match        https://agentseller.temu.com/activity/*
// @grant        GM_addStyle
// @run-at       document-end  // 调整执行时机，比idle更稳定
// @updateURL    https://raw.githubusercontent.com/348766299/huodong/main/huodong.user.js
// @downloadURL  https://raw.githubusercontent.com/348766299/temu-sales/main/huodong.user.js
// @homepageURL  https://github.com/348766299/huodong
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 核心配置 =====================
    let skuPriceMap = {
        'TX003': 34, 'TX001': 26, 'TX007': 29, 'TX018': 19, 'TX019': 19,
        'TX005': 27, 'TX029': 29, 'TX016': 22, 'TX004': 20, 'TX131': 26,
        'TX006': 27, 'TX143': 35, 'TX144': 29, 'TX142': 35, 'TX147': 28,
        'TX148': 28, 'TX149': 28, 'TX002': 19, 'TX051': 33, 'TX042': 23,
        'TX020': 29, 'TX301': 19, 'TX302': 19, 'TX303': 19, 'TX022': 29,
        'TX030': 26, 'TX021': 29, 'TX028': 29, 'TX055': 42, 'TX053': 32,
        'TX054': 32, 'TX039': 20, 'TX040': 20, 'TX010': 20, 'TX052': 19.5,
        'TX100': 39, 'TX101': 29, 'TX102': 40, 'TX103': 37, 'TX104': 35,
        'TX105': 39, 'TX106': 26, 'TX107': 39, 'TX108': 39, 'TX109': 33,
        'TX110': 32, 'TX111': 30, 'TX112': 30, 'TX113': 33, 'TX114': 40,
        'TX115': 33, 'TX116': 52, 'TX117': 56, 'TX118': 35, 'TX119': 40,
        'TX120': 36, 'TX121': 35, 'TX122': 36, 'TX123': 46, 'TX124': 36,
        'TX125': 36, 'TX126': 33, 'TX127': 42, 'TX128': 32, 'TX129': 30,
        'TX130': 30, 'TM001': 38, 'TM002': 38, 'TM003': 38, 'TM004': 38,
        'TM005': 38, 'TM100': 34, 'TM101': 34, 'TM102': 34, 'TM103': 34,
        'TM104': 34, 'TM105': 34, 'TM106': 34, 'TM107': 34, 'TM108': 34,
        'TM109': 34, 'TM110': 34, 'TM111': 34, 'TM112': 34, 'TM113': 34,
        'TM114': 34, 'TM115': 34, 'TM116': 34, 'TM117': 34, 'TM118': 34,
        'TM119': 34, 'TM120': 34, 'TM121': 34, 'TM122': 34, 'TM123': 34,
        'TM124': 34, 'TM125': 34, 'TM126': 34, 'TM127': 34, 'TM128': 34,
        'TM129': 34, 'TM130': 34, 'TM050': 29, 'TM051': 29, 'TM052': 29,
        'JQ001': 22, 'JQ008': 22, 'JQ002': 22, 'JQ002-2': 22, 'JQ003': 20.22,
        'JQ004': 22, 'JQ005': 30, 'JQ006': 26
    };

    const manualEditedInputs = new WeakSet();
    let isPriceFilling = false;
    let isCheckCanceling = false;
    let btnObserver = null;
    let pageContentObserver = null; // 新增：监听页面内容加载
    const DEFAULT_PRICE = 999;

    // ===================== 工具函数：确保节点存在 =====================
    function getSafeMountNode() {
        return document.body || document.documentElement;
    }

    // ===================== 新增：调试日志函数 =====================
    function logDebug(msg) {
        console.log(`[Temu脚本调试] ${new Date().toLocaleTimeString()}：${msg}`);
    }

    // ===================== 价格填充核心函数（无修改） =====================
    function handleInputAutoFill(input, price) {
        if (manualEditedInputs.has(input)) return;

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        ).set;

        input._isProgrammaticChange = true;
        nativeInputValueSetter.call(input, price);
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        setTimeout(() => {
            input._isProgrammaticChange = false;
        }, 50);
    }

    document.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('input[currency="CNY"][data-testid="beast-core-inputNumber-htmlInput"]')) {
            manualEditedInputs.add(target);
        }
    }, true);

    window.updateSkuPrice = (sku, newPrice) => {
        skuPriceMap[sku] = newPrice;
        scanAndFillPrices(true);
    };

    function scanAndFillPrices(force = false) {
        let fillCount = 0;
        let defaultFillCount = 0;
        document.querySelectorAll('[data-testid="beast-core-box"]').forEach(skuElement => {
            const skuText = skuElement.textContent;
            const skuMatch = skuText.match(/货号:\s*(\S+)/);

            if (skuMatch) {
                const sku = skuMatch[1];
                const row = skuElement.closest('tr');
                const mainInput = row.querySelector('input[currency="CNY"]');
                const secondaryInput = row.querySelector('input[min][max]');

                if (mainInput) {
                    if (!mainInput.id) mainInput.id = `price-input-${sku}`;
                    if (!mainInput.name) mainInput.name = `price-input-${sku}`;
                    
                    const initializationFlag = 'priceInitialized';
                    let price = skuPriceMap[sku];
                    if (price === undefined) {
                        price = DEFAULT_PRICE;
                        defaultFillCount++;
                    }

                    if ((force || !mainInput.dataset[initializationFlag])) {
                        handleInputAutoFill(mainInput, price);
                        mainInput.dataset[initializationFlag] = 'true';
                        fillCount++;
                    }
                }

                if (secondaryInput) {
                    if (!secondaryInput.id) secondaryInput.id = `secondary-input-${sku}`;
                    if (!secondaryInput.name) secondaryInput.name = `secondary-input-${sku}`;
                    
                    const initializationFlag = 'fixedInitialized';
                    if (force || !secondaryInput.dataset[initializationFlag]) {
                        handleInputAutoFill(secondaryInput, 100);
                        secondaryInput.dataset[initializationFlag] = 'true';
                    }
                }
            }
        });
        logDebug(`价格填充统计：总填充${fillCount}个，其中默认999填充${defaultFillCount}个`);
        return fillCount;
    }

    // ===================== 取消勾选核心函数（无修改） =====================
    function findElementsWithAnyText(textList) {
        const results = [];
        function traverse(node) {
            if (!node || node.nodeType === Node.COMMENT_NODE) return;
            if (node.nodeType === Node.TEXT_NODE) {
                const textContent = node.textContent.trim();
                const isMatch = textList.some(text => textContent.includes(text));
                if (isMatch) results.push(node.parentElement);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                Array.from(node.childNodes).forEach(traverse);
            }
        }
        traverse(document.body);
        return results;
    }

    async function autoUncheckInvalidItems() {
        let cancelCount = 0;
        const targetTextList = ['不可大于参考价格', '输入值需大于0'];

        const baseErrorElements = document.querySelectorAll(
            'div.ant-form-explain, span.ant-form-item-explain-error, div[style*="color:red"], span[style*="red"]'
        );
        const validBaseErrors = Array.from(baseErrorElements).filter(el => {
            const text = el.textContent.trim();
            return targetTextList.some(t => text.includes(t));
        });
        const allTextMatchedElements = findElementsWithAnyText(targetTextList);
        const allValidErrorTips = [...new Set([...validBaseErrors, ...allTextMatchedElements])];

        for (const tip of allValidErrorTips) {
            let itemRow = tip;
            for (let i = 0; i < 15; i++) {
                if (!itemRow || itemRow.tagName === 'TR') break;
                itemRow = itemRow.parentElement;
            }
            if (!itemRow || itemRow.tagName !== 'TR') continue;

            let checkbox = itemRow.querySelector('input[type="checkbox"]');
            if (!checkbox) {
                const wrapper = itemRow.querySelector('.ant-checkbox-wrapper, .ant-checkbox');
                checkbox = wrapper ? wrapper.querySelector('input[type="checkbox"]') : null;
            }
            if (!checkbox) checkbox = itemRow.querySelector('td:first-child input[type="checkbox"]');
            
            if (checkbox) {
                const checkboxId = `checkbox-${itemRow.getAttribute('data-row-key') || cancelCount}`;
                if (!checkbox.id) checkbox.id = checkboxId;
                if (!checkbox.name) checkbox.name = checkboxId;
                
                if (!document.querySelector(`label[for="${checkboxId}"]`)) {
                    const label = document.createElement('label');
                    label.htmlFor = checkboxId;
                    label.style.display = 'none';
                    itemRow.appendChild(label);
                }
            }

            if (!checkbox || !checkbox.checked) continue;

            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            const checkboxDom = checkbox.parentElement;
            if (checkboxDom) checkboxDom.click();
            cancelCount++;
        }
        return cancelCount;
    }

    // ===================== 按钮创建&管理（关键修改） =====================
    function createButton(id, text, style, clickHandler) {
        // 先移除旧按钮和关联label
        const oldBtn = document.getElementById(id);
        if (oldBtn) oldBtn.remove();
        const oldLabel = document.querySelector(`label[for="${id}"]`);
        if (oldLabel) oldLabel.remove();

        const btn = document.createElement('button');
        btn.id = id;
        btn.name = id;
        btn.type = 'button';
        btn.innerText = text;
        
        // 关键修改：增强样式，确保按钮绝对可见（调整top/right，增加边框/透明度，提升z-index）
        GM_addStyle(`
            #${id} {
                position: fixed !important;
                top: 80px !important; /* 从20px调整到80px，避免被页面顶部导航覆盖 */
                right: ${id === 'fillPriceBtn' ? '210px' : '20px'} !important;
                z-index: 999999999 !important; /* 进一步提升z-index */
                width: 180px !important;
                height: 50px !important;
                border: 3px solid #fff !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                font-size: 16px !important;
                font-weight: bold !important;
                padding: 0 !important;
                display: block !important;
                opacity: 1 !important;
                pointer-events: auto !important;
                user-select: none !important;
                -webkit-user-select: none !important;
                box-sizing: content-box !important;
                background: ${id === 'fillPriceBtn' ? '#00cc00 !important' : '#ff0000 !important'};
                color: #ffffff !important;
                box-shadow: 0 0 20px ${id === 'fillPriceBtn' ? '#00cc00 !important' : '#ff0000 !important'};
            }
            #${id}:hover {
                opacity: 0.9 !important;
                transform: scale(1.05) !important; /* 增加hover效果，方便确认按钮存在 */
            }
            label[for="${id}"] {
                display: none !important;
            }
        `);
        
        btn.dataset.tampermonkey = 'true';

        // 创建关联的label
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = text;
        label.dataset.tampermonkey = 'true';

        btn.addEventListener('click', async function() {
            clickHandler.call(this);
        });

        // 挂载到body
        const mountNode = getSafeMountNode();
        mountNode.appendChild(label);
        mountNode.appendChild(btn);
        logDebug(`${text}按钮已创建并挂载到${mountNode.tagName}节点`);
        
        // 新增：强制显示按钮（防止被页面样式隐藏）
        btn.style.display = 'block !important';
        btn.style.visibility = 'visible !important';
        
        return btn;
    }

    function createFillPriceButton() {
        return createButton('fillPriceBtn', '填充申报价格', '', async function() {
            if (isPriceFilling) {
                alert('正在填充价格中，请勿重复点击！');
                return;
            }
            isPriceFilling = true;
            this.innerText = '填充中...';

            try {
                const fillCount = scanAndFillPrices(true);
                alert(`✅ 价格填充完成！共填充${fillCount}个商品的申报价格（无对应货号的商品默认填999）`);
            } catch (error) {
                logDebug(`填充价格出错：${error.message}`);
                alert(`❌ 填充价格出错：${error.message}`);
            } finally {
                isPriceFilling = false;
                this.innerText = '填充申报价格';
            }
        });
    }

    function createCancelCheckButton() {
        return createButton('cancelCheckBtn', '取消违规商品勾选', '', async function() {
            if (isCheckCanceling) {
                alert('正在取消勾选中，请勿重复点击！');
                return;
            }
            isCheckCanceling = true;
            this.innerText = '执行中...';

            try {
                const cancelCount = await autoUncheckInvalidItems();
                if (cancelCount === 0) {
                    alert('⚠️ 未找到含"不可大于参考价格"或"输入值需大于0"的商品！');
                } else {
                    alert(`✅ 取消勾选完成！共取消${cancelCount}个违规商品勾选`);
                }
            } catch (error) {
                logDebug(`取消勾选出错：${error.message}`);
                alert(`❌ 取消勾选出错：${error.message}`);
            } finally {
                isCheckCanceling = false;
                this.innerText = '取消违规商品勾选';
            }
        });
    }

    // ===================== 监听逻辑优化 =====================
    function watchButtons() {
        if (btnObserver) btnObserver.disconnect();
        btnObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.removedNodes.length > 0) {
                    const removedIds = ['fillPriceBtn', 'cancelCheckBtn'];
                    for (let node of mutation.removedNodes) {
                        if (removedIds.includes(node.id)) {
                            logDebug(`${node.id}按钮被移除，重建！`);
                            setTimeout(() => {
                                node.id === 'fillPriceBtn' ? createFillPriceButton() : createCancelCheckButton();
                            }, 100);
                            return;
                        }
                    }
                }
            });
        });
        btnObserver.observe(getSafeMountNode(), { childList: true, subtree: true }); // 调整为subtree: true
    }

    // 新增：监听页面核心内容加载，确保按钮在内容渲染后创建
    function watchPageContent() {
        if (pageContentObserver) pageContentObserver.disconnect();
        
        // 监听页面中关键节点（商品表格/活动内容）的加载
        pageContentObserver = new MutationObserver((mutations) => {
            const hasActivityContent = document.querySelector('tr[data-row-key]') || 
                                      document.querySelector('input[currency="CNY"]') ||
                                      document.querySelector('.ant-checkbox-wrapper');
            
            if (hasActivityContent) {
                logDebug('检测到页面活动内容加载完成，创建/检查按钮');
                createFillPriceButton();
                createCancelCheckButton();
                pageContentObserver.disconnect(); // 找到内容后停止监听
            }
        });
        
        // 监听整个文档的子节点变化
        pageContentObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false
        });
    }

    function checkButtonsExist() {
        setInterval(() => {
            const mountNode = getSafeMountNode();
            if (!mountNode) return;

            if (!document.getElementById('fillPriceBtn')) {
                logDebug('填充价格按钮不存在，重建！');
                createFillPriceButton();
            }
            if (!document.getElementById('cancelCheckBtn')) {
                logDebug('取消勾选按钮不存在，重建！');
                createCancelCheckButton();
            }
        }, 2000); // 调整为2秒，降低性能消耗
    }

    // ===================== 初始化逻辑重构 =====================
    function init() {
        logDebug('开始初始化脚本');
        
        // 1. 先创建按钮（保底）
        createFillPriceButton();
        createCancelCheckButton();
        
        // 2. 启动按钮监听
        watchButtons();
        
        // 3. 启动页面内容监听（核心新增）
        watchPageContent();
        
        // 4. 启动定时检查
        checkButtonsExist();
        
        logDebug('脚本初始化完成');
    }

    // 最终初始化：兼容SPA页面
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 立即执行+延迟执行（防止SPA页面还没渲染内容）
        init();
        setTimeout(init, 1000);
    }

})();
