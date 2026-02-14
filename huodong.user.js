// ==UserScript==
// @name         Temu服装活动报名（价格填充+取消勾选）
// @namespace    http://tampermonkey.net/
// @version      1.6.2
// @description  仅点击按钮填充申报价格（无对应货号默认填999）+取消含价格提示的商品勾选（按钮移至右上角）
// @author       悟
// @match        https://agentseller.temu.com/activity/*
// @grant        GM_addStyle
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/348766299/huodong/main/huodong.user.js  // 油猴检测更新的链接
// @downloadURL  https://raw.githubusercontent.com/348766299/temu-sales/main/huodong.user.js  // 油猴下载新版本的链接
// @homepageURL  https://github.com/348766299/huodong  // 脚本的GitHub仓库主页（可选）
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 第一部分：价格填充核心配置 =====================
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

    // 手动修改标记系统（避免自动填充覆盖手动修改）
    const manualEditedInputs = new WeakSet();
    // 按钮状态&监听变量
    let isPriceFilling = false;
    let isCheckCanceling = false;
    let btnObserver = null;
    // 默认填充价格（无对应货号时使用）
    const DEFAULT_PRICE = 999;

    // ===================== 价格填充核心函数 =====================
    // 高级输入处理（模拟原生输入，适配框架监听）
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

    // 监听手动修改事件（标记手动修改的输入框）
    document.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('input[currency="CNY"][data-testid="beast-core-inputNumber-htmlInput"]')) {
            manualEditedInputs.add(target);
        }
    }, true);

    // 动态更新映射表（可全局调用）
    window.updateSkuPrice = (sku, newPrice) => {
        skuPriceMap[sku] = newPrice;
        scanAndFillPrices(true);
    };

    // 核心扫描填充逻辑（仅按钮触发，无货号默认填999）
    function scanAndFillPrices(force = false) {
        let fillCount = 0;
        let defaultFillCount = 0; // 统计默认填充999的数量
        // 遍历货号元素
        document.querySelectorAll('[data-testid="beast-core-box"]').forEach(skuElement => {
            const skuText = skuElement.textContent;
            const skuMatch = skuText.match(/货号:\s*(\S+)/);

            if (skuMatch) {
                const sku = skuMatch[1];
                const row = skuElement.closest('tr');
                const mainInput = row.querySelector('input[currency="CNY"]'); // 申报价格输入框
                const secondaryInput = row.querySelector('input[min][max]'); // 副输入框

                // 填充主输入框（申报价格：有货号用对应价，无货号用默认999）
                if (mainInput) {
                    const initializationFlag = 'priceInitialized';
                    // 核心修改：无对应货号时赋值为DEFAULT_PRICE(999)
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

                // 填充副输入框（固定100）
                if (secondaryInput) {
                    const initializationFlag = 'fixedInitialized';
                    if (force || !secondaryInput.dataset[initializationFlag]) {
                        handleInputAutoFill(secondaryInput, 100);
                        secondaryInput.dataset[initializationFlag] = 'true';
                    }
                }
            }
        });
        // 控制台打印填充统计
        console.log(`📊 价格填充统计：总填充${fillCount}个，其中默认999填充${defaultFillCount}个`);
        return fillCount;
    }

    // ===================== 取消勾选核心函数 =====================
    // 递归查找包含指定文本列表的元素
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

    // 取消违规商品勾选
    async function autoUncheckInvalidItems() {
        let cancelCount = 0;
        const targetTextList = ['不可大于参考价格', '输入值需大于0'];

        // 查找违规提示元素
        const baseErrorElements = document.querySelectorAll(
            'div.ant-form-explain, span.ant-form-item-explain-error, div[style*="color:red"], span[style*="red"]'
        );
        const validBaseErrors = Array.from(baseErrorElements).filter(el => {
            const text = el.textContent.trim();
            return targetTextList.some(t => text.includes(t));
        });
        const allTextMatchedElements = findElementsWithAnyText(targetTextList);
        const allValidErrorTips = [...new Set([...validBaseErrors, ...allTextMatchedElements])];

        // 遍历违规提示，取消对应勾选
        for (const tip of allValidErrorTips) {
            // 找商品行（TR）
            let itemRow = tip;
            for (let i = 0; i < 15; i++) {
                if (!itemRow || itemRow.tagName === 'TR') break;
                itemRow = itemRow.parentElement;
            }
            if (!itemRow || itemRow.tagName !== 'TR') continue;

            // 找复选框
            let checkbox = itemRow.querySelector('input[type="checkbox"]');
            if (!checkbox) {
                const wrapper = itemRow.querySelector('.ant-checkbox-wrapper, .ant-checkbox');
                checkbox = wrapper ? wrapper.querySelector('input[type="checkbox"]') : null;
            }
            if (!checkbox) checkbox = itemRow.querySelector('td:first-child input[type="checkbox"]');
            if (!checkbox || !checkbox.checked) continue;

            // 取消勾选（模拟真实操作）
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            const checkboxDom = checkbox.parentElement;
            if (checkboxDom) checkboxDom.click();
            cancelCount++;
        }
        return cancelCount;
    }

    // ===================== 按钮创建&管理 =====================
    // 创建按钮通用函数
    function createButton(id, text, style, clickHandler) {
        let btn = document.getElementById(id);
        if (btn) return btn;

        btn = document.createElement('button');
        btn.id = id;
        btn.innerText = text;
        btn.style = style;
        btn.dataset.tampermonkey = 'true';

        // 点击事件
        btn.addEventListener('click', async function() {
            clickHandler.call(this);
        });

        // 挂载到html根节点（避免被重渲染删除）
        document.querySelector('html').appendChild(btn);
        console.log(`✅ ${text}按钮已创建`);
        return btn;
    }

    // 创建填充价格按钮（绿色）- 移至右上角
    function createFillPriceButton() {
        const btnStyle = `
            position: fixed !important;
            top: 20px !important;
            right: 210px !important; /* 与取消勾选按钮错开（右侧间距210px） */
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

        return createButton('fillPriceBtn', '填充申报价格', btnStyle, async function() {
            if (isPriceFilling) {
                alert('正在填充价格中，请勿重复点击！');
                return;
            }
            isPriceFilling = true;
            this.innerText = '填充中...';

            try {
                const fillCount = scanAndFillPrices(true); // 强制填充所有匹配商品
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

    // 创建取消勾选按钮（红色）- 移至右上角
    function createCancelCheckButton() {
        const btnStyle = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important; /* 右侧间距20px（最右侧） */
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
                            node.id === 'fillPriceBtn' ? createFillPriceButton() : createCancelCheckButton();
                            return;
                        }
                    }
                }
            });
        });
        btnObserver.observe(document.querySelector('html'), { childList: true, subtree: false });
    }

    // 定时检查按钮是否存在
    function checkButtonsExist() {
        setInterval(() => {
            if (!document.getElementById('fillPriceBtn')) createFillPriceButton();
            if (!document.getElementById('cancelCheckBtn')) createCancelCheckButton();
        }, 500);
    }

    // ===================== 初始化 =====================
    function init() {
        // 创建两个按钮
        createFillPriceButton();
        createCancelCheckButton();
        // 监听按钮移除
        watchButtons();
        // 定时检查按钮
        checkButtonsExist();
    }

    // 启动所有功能（仅初始化按钮，不自动填充价格）
    init();
    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('load', init);
    setTimeout(init, 100);


})();




