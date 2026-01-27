// ==UserScript==
// @name         Temu服装活动报名（价格填充+取消勾选）
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  仅点击按钮填充申报价格（无对应货号默认填999）+取消含价格提示的商品勾选（按钮移至右上角）
// @author       悟
// @match        https://agentseller.temu.com/activity/*
// @grant        GM_addStyle
// @run-at       document-idle  // 改为idle确保DOM完全加载
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
    const DEFAULT_PRICE = 999;

    // ===================== 工具函数：确保节点存在 =====================
    function getSafeMountNode() {
        // 优先用body，容错性更高；html节点可能未就绪
        return document.body || document.querySelector('html') || document.documentElement;
    }

    // ===================== 价格填充核心函数 =====================
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
                    // 为页面原有输入框补充id/name（解决表单提示）
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
                    // 为页面原有输入框补充id/name（解决表单提示）
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
        console.log(`📊 价格填充统计：总填充${fillCount}个，其中默认999填充${defaultFillCount}个`);
        return fillCount;
    }

    // ===================== 取消勾选核心函数 =====================
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
            
            // 为复选框补充id/name和label（解决表单提示）
            if (checkbox) {
                const checkboxId = `checkbox-${itemRow.getAttribute('data-row-key') || cancelCount}`;
                if (!checkbox.id) checkbox.id = checkboxId;
                if (!checkbox.name) checkbox.name = checkboxId;
                
                // 检查是否有关联label，无则创建
                if (!document.querySelector(`label[for="${checkboxId}"]`)) {
                    const label = document.createElement('label');
                    label.htmlFor = checkboxId;
                    label.style.display = 'none'; // 隐藏label，不影响页面布局
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

    // ===================== 按钮创建&管理（修复表单提示） =====================
    function createButton(id, text, style, clickHandler) {
        // 先移除旧按钮和关联label（避免重复创建）
        const oldBtn = document.getElementById(id);
        if (oldBtn) oldBtn.remove();
        const oldLabel = document.querySelector(`label[for="${id}"]`);
        if (oldLabel) oldLabel.remove();

        const btn = document.createElement('button');
        btn.id = id;
        // 补充name属性（解决"A form field element should have an id or name attribute"提示）
        btn.name = id;
        // 标记为按钮类型（避免被识别为默认表单提交按钮）
        btn.type = 'button';
        
        btn.innerText = text;
        // 增强样式优先级：用GM_addStyle定义全局样式，避免被页面覆盖
        GM_addStyle(`
            #${id} {
                position: fixed !important;
                top: 20px !important;
                z-index: 99999999 !important; /* 提升z-index，避免被页面元素覆盖 */
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
            }
            /* 隐藏关联的label，不影响页面布局 */
            label[for="${id}"] {
                display: none !important;
            }
        `);
        // 追加个性化样式
        btn.style = style;
        btn.dataset.tampermonkey = 'true';

        // 创建关联的label（解决"No label associated with a form field"提示）
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = text; // 匹配按钮文本，提升可访问性
        label.dataset.tampermonkey = 'true';

        btn.addEventListener('click', async function() {
            clickHandler.call(this);
        });

        // 挂载到安全节点（body容错性更高）
        const mountNode = getSafeMountNode();
        mountNode.appendChild(label); // 先挂载label
        mountNode.appendChild(btn);   // 再挂载按钮
        console.log(`✅ ${text}按钮（含关联label）已创建并挂载到${mountNode.tagName}节点`);
        return btn;
    }

    function createFillPriceButton() {
        const btnStyle = `
            right: 210px !important;
            background: #00cc00 !important;
            color: #ffffff !important;
            box-shadow: 0 0 20px #00cc00 !important;
        `;

        return createButton('fillPriceBtn', '填充申报价格', btnStyle, async function() {
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
                console.error('❌ 填充价格出错：', error);
                alert(`❌ 填充价格出错：${error.message}`);
            } finally {
                isPriceFilling = false;
                this.innerText = '填充申报价格';
            }
        });
    }

    function createCancelCheckButton() {
        const btnStyle = `
            right: 20px !important;
            background: #ff0000 !important;
            color: #ffffff !important;
            box-shadow: 0 0 20px #ff0000 !important;
        `;

        return createButton('cancelCheckBtn', '取消违规商品勾选', btnStyle, async function() {
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
                console.error('❌ 取消勾选出错：', error);
                alert(`❌ 取消勾选出错：${error.message}`);
            } finally {
                isCheckCanceling = false;
                this.innerText = '取消违规商品勾选';
            }
        });
    }

    // 修复监听逻辑：监听body节点（按钮挂载到body）
    function watchButtons() {
        if (btnObserver) btnObserver.disconnect();
        btnObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.removedNodes.length > 0) {
                    const removedIds = ['fillPriceBtn', 'cancelCheckBtn'];
                    for (let node of mutation.removedNodes) {
                        if (removedIds.includes(node.id)) {
                            console.log(`⚠️ ${node.id}按钮被移除，重建！`);
                            setTimeout(() => {
                                node.id === 'fillPriceBtn' ? createFillPriceButton() : createCancelCheckButton();
                            }, 100); // 延迟重建，避免冲突
                            return;
                        }
                    }
                }
            });
        });
        // 监听body的子节点变化（包含按钮挂载/移除）
        btnObserver.observe(getSafeMountNode(), { childList: true, subtree: false });
    }

    function checkButtonsExist() {
        setInterval(() => {
            const mountNode = getSafeMountNode();
            if (!mountNode) return; // 容错：节点未就绪时跳过

            if (!document.getElementById('fillPriceBtn')) {
                console.log('⚠️ 填充价格按钮不存在，重建！');
                createFillPriceButton();
            }
            if (!document.getElementById('cancelCheckBtn')) {
                console.log('⚠️ 取消勾选按钮不存在，重建！');
                createCancelCheckButton();
            }
        }, 1000); // 延长检查间隔，降低性能消耗
    }

    // ===================== 初始化 =====================
    function init() {
        console.log('🔧 开始初始化按钮...');
        // 确保DOM完全就绪后创建按钮
        if (document.readyState !== 'complete') {
            console.log('🔧 DOM未完全加载，延迟初始化...');
            setTimeout(init, 500);
            return;
        }

        // 创建按钮
        createFillPriceButton();
        createCancelCheckButton();
        // 启动监听
        watchButtons();
        // 启动定时检查
        checkButtonsExist();
        console.log('✅ 按钮初始化完成！');
    }

    // 仅在DOM完全加载后执行初始化（避免提前执行）
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init); // 等待页面所有资源加载完成
    }

})();
