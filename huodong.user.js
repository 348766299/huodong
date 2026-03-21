// ==UserScript==
// @name         Temu服装活动报名（价格填充+取消勾选）
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  仅点击按钮填充申报价格（无对应货号默认填999）+取消含价格提示的商品勾选（按钮移至右上角）+补充库存填充
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

    // ===================== 第一部分：核心配置 =====================
    // 货号与申报价格映射表（可动态修改）
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
        'JQ001': 22, 'JQ008': 22, 'JQ002': 22, 'JQ002-2': 22, 'JQ003': 20.22,
        'JQ010': 26,'JQ011': 26,'JQ021': 22,'JQ020': 22,
        'JQ004': 22, 'JQ005': 30, 'JQ006': 26, 'JQ007': 20.22, 'JQ009': 22
    };

    // 库存默认值（可根据需求修改）
    const DEFAULT_STOCK = 9999;
    // 默认填充价格（无对应货号时使用）
    const DEFAULT_PRICE = 999;

    // 手动修改标记系统（避免自动填充覆盖手动修改）
    const manualEditedInputs = new WeakSet();
    // 按钮状态&监听变量
    let isPriceFilling = false;
    let isCheckCanceling = false;
    let btnObserver = null;

    // ===================== 核心工具函数 =====================
    // 增强版输入模拟（适配React/Vue等框架）
    function setInputValue(input, value) {
        if (!input || manualEditedInputs.has(input)) return false;

        // 聚焦输入框
        input.focus();
        
        // 清空原有值
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 设置新值
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, value);
        
        // 触发所有必要事件
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // 失焦
        input.blur();
        
        return true;
    }

    // 查找包含指定文本的元素（原生JS实现contains功能）
    function findElementsContainingText(tagNames, text) {
        const elements = [];
        // 遍历指定标签类型
        tagNames.forEach(tag => {
            const allElements = document.getElementsByTagName(tag);
            for (let el of allElements) {
                if (el.textContent && el.textContent.includes(text)) {
                    elements.push(el);
                }
            }
        });
        return elements;
    }

    // 监听手动修改事件（标记手动修改的输入框）
    document.addEventListener('input', (e) => {
        const target = e.target;
        // 匹配价格/库存输入框
        if (target.matches('input[currency="CNY"], input[min][max], input[type="number"]')) {
            manualEditedInputs.add(target);
        }
    }, true);

    // 动态更新映射表（可全局调用）
    window.updateSkuPrice = (sku, newPrice) => {
        skuPriceMap[sku] = newPrice;
        scanAndFillPrices(true);
    };

    // ===================== 价格+库存填充核心函数 =====================
    function scanAndFillPrices(force = false) {
        let priceFillCount = 0;
        let stockFillCount = 0;
        let defaultPriceCount = 0;
        
        // 修复：使用原生JS替代jQuery的:contains选择器
        // 1. 先获取标准选择器的元素
        const baseSkuElements = document.querySelectorAll('[data-testid="beast-core-box"]');
        // 2. 再查找包含"货号"文本的元素
        const textBasedSkuElements = [
            ...findElementsContainingText(['div'], '货号'),
            ...findElementsContainingText(['td'], '货号'),
            ...findElementsContainingText(['span'], '货号')
        ];
        // 3. 合并并去重
        const skuElements = [...new Set([...baseSkuElements, ...textBasedSkuElements])];

        if (skuElements.length === 0) {
            console.warn('⚠️ 未找到货号相关元素');
            return { priceFillCount, stockFillCount };
        }

        skuElements.forEach(skuElement => {
            const skuText = skuElement.textContent || skuElement.innerText;
            const skuMatch = skuText.match(/货号:\s*(\S+)/);
            
            if (!skuMatch) return;
            const sku = skuMatch[1].trim();
            
            // 查找商品行（增强层级查找）
            let row = skuElement.closest('tr');
            if (!row) row = skuElement.closest('div[class*="row"], div[class*="item"]');
            if (!row) return;

            // ===== 填充申报价格 =====
            // 多选择器匹配价格输入框
            const priceInputs = row.querySelectorAll(
                'input[currency="CNY"], input[data-testid*="price"], input[placeholder*="价格"], input[name*="price"], input[type="number"][class*="price"]'
            );
            
            const priceInput = priceInputs.length > 0 ? priceInputs[0] : null;
            if (priceInput) {
                const initializationFlag = 'priceInitialized';
                if (force || !priceInput.dataset[initializationFlag]) {
                    const price = skuPriceMap[sku] ?? DEFAULT_PRICE;
                    if (setInputValue(priceInput, price)) {
                        priceFillCount++;
                        priceInput.dataset[initializationFlag] = 'true';
                        if (price === DEFAULT_PRICE) defaultPriceCount++;
                    }
                }
            }

            // ===== 填充库存 =====
            // 多选择器匹配库存输入框
            const stockInputs = row.querySelectorAll(
                'input[min][max], input[data-testid*="stock"], input[placeholder*="库存"], input[name*="stock"], input[type="number"][class*="stock"]'
            );
            
            const stockInput = stockInputs.length > 0 ? stockInputs[0] : null;
            if (stockInput) {
                const initializationFlag = 'stockInitialized';
                if (force || !stockInput.dataset[initializationFlag]) {
                    if (setInputValue(stockInput, DEFAULT_STOCK)) {
                        stockFillCount++;
                        stockInput.dataset[initializationFlag] = 'true';
                    }
                }
            }
        });

        // 控制台打印填充统计
        console.log(`📊 填充统计：
          - 价格填充：${priceFillCount}个（默认999：${defaultPriceCount}个）
          - 库存填充：${stockFillCount}个`);
        
        return { priceFillCount, stockFillCount, defaultPriceCount };
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

        // 增强错误提示元素查找
        const baseErrorElements = document.querySelectorAll(
            'div.ant-form-explain, span.ant-form-item-explain-error, div[style*="color:red"], span[style*="red"], div[class*="error"], span[class*="error"]'
        );
        
        const validBaseErrors = Array.from(baseErrorElements).filter(el => {
            const text = el.textContent.trim();
            return targetTextList.some(t => text.includes(t));
        });
        
        const allTextMatchedElements = findElementsWithAnyText(targetTextList);
        const allValidErrorTips = [...new Set([...validBaseErrors, ...allTextMatchedElements])];

        // 遍历违规提示，取消对应勾选
        for (const tip of allValidErrorTips) {
            // 增强商品行查找
            let itemRow = tip;
            for (let i = 0; i < 20; i++) {
                if (!itemRow) break;
                if (itemRow.tagName === 'TR' || itemRow.classList.toString().includes('item')) break;
                itemRow = itemRow.parentElement;
            }
            if (!itemRow) continue;

            // 增强复选框查找
            let checkbox = itemRow.querySelector('input[type="checkbox"]');
            if (!checkbox) {
                const wrapper = itemRow.querySelector('.ant-checkbox-wrapper, .ant-checkbox, [class*="checkbox"]');
                checkbox = wrapper ? wrapper.querySelector('input[type="checkbox"]') : null;
            }
            if (!checkbox) checkbox = itemRow.closest('tr')?.querySelector('td:first-child input[type="checkbox"]');
            
            if (!checkbox || !checkbox.checked) continue;

            // 模拟真实取消勾选操作
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            
            // 兼容Antd组件
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

        // 挂载到body（更稳定）
        document.body.appendChild(btn);
        console.log(`✅ ${text}按钮已创建`);
        return btn;
    }

    // 创建填充价格+库存按钮（绿色）
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
- 库存填充：${stockFillCount}个`);
            } catch (error) {
                console.error('❌ 填充出错：', error);
                alert(`❌ 填充出错：${error.message}`);
            } finally {
                isPriceFilling = false;
                this.innerText = '填充价格+库存';
            }
        });
    }

    // 创建取消勾选按钮（红色）
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

    // 监听按钮是否被移除（重建保障）
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

    // 定时检查按钮是否存在
    function checkButtonsExist() {
        setInterval(() => {
            if (!document.getElementById('fillPriceBtn')) createFillPriceButton();
            if (!document.getElementById('cancelCheckBtn')) createCancelCheckButton();
        }, 1000);
    }

    // ===================== 初始化 =====================
    function init() {
        // 等待页面完全加载
        if (document.readyState !== 'complete') {
            setTimeout(init, 500);
            return;
        }
        
        // 创建按钮
        createFillPriceButton();
        createCancelCheckButton();
        // 监听按钮移除
        watchButtons();
        // 定时检查按钮
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
