// ==UserScript==
// @name         Temu服装活动报名（价格填充+取消勾选）
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  适配最新页面结构 - 填充申报价格（无对应货号默认填999）+取消含价格提示的商品勾选
// @author       悟
// @match        https://agentseller.temu.com/activity/*
// @grant        GM_addStyle
// @run-at       document-end
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
        'TX020': 29, 'TX301': 22, 'TX302': 22, 'TX303': 22, 'TX022': 29,
        'TX030': 26, 'TX021': 29, 'TX028': 29, 'TX055': 42, 'TX053': 32,
        'TX054': 32, 'TX039': 20, 'TX040': 20, 'TX010': 20, 'TX052': 19.5,
        'TX100': 39, 'TX101': 29, 'TX102': 40, 'TX103': 37, 'TX104': 35,
        'TX105': 39, 'TX106': 26, 'TX107': 32, 'TX108': 32, 'TX109': 33,
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
        'JQ001': 21.2, 'JQ008': 21.2, 'JQ002': 22, 'JQ002-2': 22, 'JQ003': 20.22,
        'JQ010': 26,'JQ011': 26,'JQ021': 22,'JQ020': 22,
        'JQ004': 22, 'JQ005': 30, 'JQ006': 26, 'JQ007': 20.22, 'JQ009': 21.2,
        'TX229': 32, 'JQ031': 21.2, 'JQ030': 21.2, 'JQ032': 21.2
    };

    // 🔥 修复1：库存默认值改为100
    const DEFAULT_STOCK = 100;
    const DEFAULT_PRICE = 999;
    const manualEditedInputs = new WeakSet();
    let isPriceFilling = false;
    let isCheckCanceling = false;
    let btnObserver = null;

    // ===================== 核心工具函数 =====================
    // 增强版输入模拟
    function setInputValue(input, value) {
        if (!input || manualEditedInputs.has(input)) return false;

        // 强制聚焦并清空
        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // 原生赋值（适配React）
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, value);

        // 触发所有必要事件
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.blur();

        return true;
    }

    // 🔥 修复2：货号匹配改为严格5位数（前缀2位+数字3位）
    // 匹配规则：TX/JQ/TM开头 + 3位数字（支持JQ002-2这类扩展格式）
    function extractSkuFromText(text) {
        // 严格匹配：前缀(TX/JQ/TM) + 3位数字（可选-后缀）
        const skuRegex = /(TX|JQ|TM)\d{3}(-\d+)?/g;
        const matches = text.match(skuRegex);
        return matches ? matches[0] : null;
    }

    // 监听手动修改
    document.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('input[currency="CNY"], input[min][max], input[type="number"]')) {
            manualEditedInputs.add(target);
        }
    }, true);

    window.updateSkuPrice = (sku, newPrice) => {
        skuPriceMap[sku] = newPrice;
        scanAndFillPrices(true);
    };

    // ===================== 价格+库存填充核心 =====================
    function scanAndFillPrices(force = false) {
        let priceFillCount = 0;
        let stockFillCount = 0;
        let defaultPriceCount = 0;

        // 1. 获取所有货号元素（页面中是data-testid="beast-core-box"）
        const skuBoxElements = document.querySelectorAll('[data-testid="beast-core-box"]');

        if (skuBoxElements.length === 0) {
            console.warn('⚠️ 未找到货号盒子元素');
            return { priceFillCount, stockFillCount };
        }

        // 2. 遍历每个货号元素
        skuBoxElements.forEach(skuBox => {
            const boxText = skuBox.textContent.trim();
            const sku = extractSkuFromText(boxText);

            if (!sku) {
                console.log(`⚠️ 未从文本中提取到5位数货号：${boxText}`);
                return;
            }

            console.log(`✅ 找到5位数货号：${sku}`);

            // 3. 找到当前货号所在的TD单元格
            const skuTd = skuBox.closest('td[data-testid="beast-core-table-td"]');
            if (!skuTd) {
                console.warn('⚠️ 未找到货号所在的TD单元格');
                return;
            }

            // 4. 找到同一行的其他TD（价格输入框所在的TD）
            let priceInput = null;
            const parentTr = skuTd.closest('tr');

            if (parentTr) {
                // 查找当前行所有包含价格输入框的TD
                const allTds = parentTr.querySelectorAll('td[data-testid="beast-core-table-td"]');
                allTds.forEach(td => {
                    const input = td.querySelector('input[currency="CNY"][data-testid="beast-core-inputNumber-htmlInput"]');
                    if (input) priceInput = input;
                });
            }

            // 降级方案：如果方案1没找到，向上查找整个表格的价格输入框
            if (!priceInput) {
                // 找到页面中所有价格输入框
                const allPriceInputs = document.querySelectorAll('input[currency="CNY"][data-testid="beast-core-inputNumber-htmlInput"]');
                // 取第一个可用的，或按位置匹配
                priceInput = allPriceInputs[Array.from(skuBoxElements).indexOf(skuBox)] || allPriceInputs[0];
            }

            // 5. 填充价格
            if (priceInput) {
                const initializationFlag = 'priceInitialized';
                if (force || !priceInput.dataset[initializationFlag]) {
                    const price = skuPriceMap[sku] ?? DEFAULT_PRICE;
                    if (setInputValue(priceInput, price)) {
                        priceFillCount++;
                        priceInput.dataset[initializationFlag] = 'true';
                        if (price === DEFAULT_PRICE) defaultPriceCount++;
                        console.log(`✅ 为${sku}填充价格：${price}`);
                    }
                }
            } else {
                console.warn(`⚠️ 未找到${sku}对应的价格输入框`);
            }

            // 6. 填充库存（适配你提供的库存元素结构）
            let stockInput = null;
            if (parentTr) {
                // 🔥 优化：精准匹配库存输入框（根据你提供的元素特征）
                stockInput = parentTr.querySelector('input[min="0"][max="99999999"][placeholder="请输入"][data-testid="beast-core-inputNumber-htmlInput"]:not([currency="CNY"])');
            }

            // 降级方案：全局查找库存输入框（排除价格输入框）
            if (!stockInput) {
                const allStockInputs = document.querySelectorAll('input[min="0"][max="99999999"][placeholder="请输入"][data-testid="beast-core-inputNumber-htmlInput"]:not([currency="CNY"])');
                stockInput = allStockInputs[Array.from(skuBoxElements).indexOf(skuBox)] || allStockInputs[0];
            }

            if (stockInput) {
                const initializationFlag = 'stockInitialized';
                if (force || !stockInput.dataset[initializationFlag]) {
                    // 使用修改后的默认值100
                    if (setInputValue(stockInput, DEFAULT_STOCK)) {
                        stockFillCount++;
                        stockInput.dataset[initializationFlag] = 'true';
                        console.log(`✅ 为${sku}填充库存：${DEFAULT_STOCK}`);
                    }
                }
            } else {
                console.warn(`⚠️ 未找到${sku}对应的库存输入框`);
            }
        });

        console.log(`📊 填充统计：
          - 价格填充：${priceFillCount}个（默认999：${defaultPriceCount}个）
          - 库存填充：${stockFillCount}个（默认100）`);

        return { priceFillCount, stockFillCount, defaultPriceCount };
    }

    // ===================== 取消勾选核心 =====================
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
            'div.ant-form-explain, span.ant-form-item-explain-error, div[style*="color:red"], span[style*="red"], div[class*="error"], span[class*="error"]'
        );

        const validBaseErrors = Array.from(baseErrorElements).filter(el => {
            const text = el.textContent.trim();
            return targetTextList.some(t => text.includes(t));
        });

        const allTextMatchedElements = findElementsWithAnyText(targetTextList);
        const allValidErrorTips = [...new Set([...validBaseErrors, ...allTextMatchedElements])];

        for (const tip of allValidErrorTips) {
            let itemRow = tip;
            for (let i = 0; i < 20; i++) {
                if (!itemRow) break;
                if (itemRow.tagName === 'TR' || itemRow.classList.toString().includes('item')) break;
                itemRow = itemRow.parentElement;
            }
            if (!itemRow) continue;

            let checkbox = itemRow.querySelector('input[type="checkbox"]');
            if (!checkbox) {
                const wrapper = itemRow.querySelector('.ant-checkbox-wrapper, .ant-checkbox, [class*="checkbox"]');
                checkbox = wrapper ? wrapper.querySelector('input[type="checkbox"]') : null;
            }
            if (!checkbox) checkbox = itemRow.closest('tr')?.querySelector('td:first-child input[type="checkbox"]');

            if (!checkbox || !checkbox.checked) continue;

            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));

            const checkboxDom = checkbox.parentElement;
            if (checkboxDom) {
                checkboxDom.click();
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            cancelCount++;
        }
        return cancelCount;
    }

    // ===================== 按钮创建&管理 =====================
    function createButton(id, text, style, clickHandler) {
        let btn = document.getElementById(id);
        if (btn) return btn;

        btn = document.createElement('button');
        btn.id = id;
        btn.innerText = text;
        btn.style = style;
        btn.dataset.tampermonkey = 'true';

        btn.addEventListener('click', async function() {
            clickHandler.call(this);
        });

        document.body.appendChild(btn);
        console.log(`✅ ${text}按钮已创建`);
        return btn;
    }

    function createFillPriceButton() {
        const btnStyle = `
            position: fixed !important;
            top: 20px !important;
            right: 210px !important;
            z-index: 9999999 !important;
            width: 180px !important;
            height: 50px !important;
            background: #00cc00 !important;
            color: #ffffff !important;
            border: 3px solid #fff !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            font-size: 16px !important;
            font-weight: bold !important;
            box-shadow: 0 0 20px #00cc00 !important;
            padding: 0 !important;
            display: block !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            box-sizing: content-box !important;
        `;

        return createButton('fillPriceBtn', '填充价格+库存', btnStyle, async function() {
            if (isPriceFilling) {
                alert('正在填充中，请勿重复点击！');
                return;
            }
            isPriceFilling = true;
            this.innerText = '填充中...';

            try {
                const { priceFillCount, stockFillCount, defaultPriceCount } = scanAndFillPrices(true);
                alert(`✅ 填充完成！
- 价格填充：${priceFillCount}个（默认999：${defaultPriceCount}个）
- 库存填充：${stockFillCount}个（默认100）`);
            } catch (error) {
                console.error('❌ 填充出错：', error);
                alert(`❌ 填充出错：${error.message}`);
            } finally {
                isPriceFilling = false;
                this.innerText = '填充价格+库存';
            }
        });
    }

    function createCancelCheckButton() {
        const btnStyle = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            z-index: 9999999 !important;
            width: 180px !important;
            height: 50px !important;
            background: #ff0000 !important;
            color: #ffffff !important;
            border: 3px solid #fff !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            font-size: 16px !important;
            font-weight: bold !important;
            box-shadow: 0 0 20px #ff0000 !important;
            padding: 0 !important;
            display: block !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            box-sizing: content-box !important;
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
                            }, 100);
                            return;
                        }
                    }
                }
            });
        });
        btnObserver.observe(document.body, { childList: true, subtree: true });
    }

    function checkButtonsExist() {
        setInterval(() => {
            if (!document.getElementById('fillPriceBtn')) createFillPriceButton();
            if (!document.getElementById('cancelCheckBtn')) createCancelCheckButton();
        }, 1000);
    }

    // ===================== 初始化 =====================
    function init() {
        if (document.readyState !== 'complete') {
            setTimeout(init, 500);
            return;
        }

        createFillPriceButton();
        createCancelCheckButton();
        watchButtons();
        checkButtonsExist();
    }

    // 多重启动保障
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('load', init);
    setTimeout(init, 1000);

})();
