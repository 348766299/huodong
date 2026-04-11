// ==UserScript==
// @name         Temu服装活动报名4.0
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  终极修复：虚拟滚动未加载内容无法填充、滚动卡顿、价格失效；全表格强制填充
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

    // ===================== 你的货号价格表 =====================
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
        'TX229': 32, 'JQ031': 21.2, 'JQ030': 21.2, 'JQ032': 21.2,
        'JQ025': 27, 'JQ017': 22, 'JQ012': 23
    };

    const manualEditedInputs = new WeakSet();
    let isPriceFilling = false;
    let isRunning = false;
    const DEFAULT_PRICE = 999;
    const DEFAULT_STOCK = 100;

    // ===================== 强制赋值输入框 =====================
    function forceSetInputValue(input, value) {
        if (!input || manualEditedInputs.has(input)) return;
        try {
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
        } catch (e) {}
    }

    // ===================== 填充单行 =====================
    function fillRowPrice(row) {
        const text = row.textContent || '';
        const skuMatch = text.match(/货号[:\s]+([A-Za-z0-9-]+)/);
        if (!skuMatch) return false;

        const sku = skuMatch[1].trim();
        const price = skuPriceMap[sku] || DEFAULT_PRICE;

        const priceInput = row.querySelector('input[currency="CNY"][data-testid="beast-core-inputNumber-htmlInput"]');
        const stockInput = row.querySelector('input[min][max][data-testid="beast-core-inputNumber-htmlInput"]');

        let success = false;
        if (priceInput) {
            forceSetInputValue(priceInput, price);
            success = true;
        }
        if (stockInput) {
            forceSetInputValue(stockInput, DEFAULT_STOCK);
        }
        return success;
    }

    // ===================== 取消勾选（精准点击） =====================
    function uncheckRow(row) {
        try {
            const checkbox = row.querySelector('.CBX_square_5-120-1.CBX_active_5-120-1');
            if (!checkbox) return false;
            checkbox.click();
            return true;
        } catch (e) {
            return false;
        }
    }

    // ===================== 检查单行是否超价 =====================
    function checkRow(row) {
        try {
            const refEl = row.querySelector('.table-goods_labelValue__2XVSg');
            if (!refEl) return false;
            const refPrice = parseFloat(refEl.textContent.replace(/[^\d.]/g, '')) || 0;

            const inputEl = row.querySelector('input[currency="CNY"]');
            if (!inputEl) return false;
            const myPrice = parseFloat(inputEl.value) || 0;

            return myPrice > refPrice && refPrice > 0;
        } catch (e) {
            return false;
        }
    }

    // ===================== ✅ 终极：一边滚动、一边填充、一边检测、一边取消 =====================
    async function scrollFillCheckUncheck() {
        const scrollContainer = document.querySelector('div.TB_body_5-120-1 > div[style*="overflow-y"]') ||
                               document.querySelector('div[class*="body"] div[style*="overflow-y"]');

        if (!scrollContainer) {
            alert("❌ 找不到滚动容器");
            return 0;
        }

        let cancelCount = 0;
        let fillCount = 0;
        scrollContainer.scrollTop = 0;
        await new Promise(r => setTimeout(r, 300));

        let retry = 0;
        const maxRetry = 1000;
        let lastScroll = -1;

        while (retry < maxRetry) {
            const rows = document.querySelectorAll('tr.TB_tr_5-120-1');
            rows.forEach(row => {
                if (fillRowPrice(row)) fillCount++;
                if (checkRow(row)) {
                    if (uncheckRow(row)) cancelCount++;
                }
            });

            lastScroll = scrollContainer.scrollTop;
            scrollContainer.scrollTop += 80;
            await new Promise(r => setTimeout(r, 60));
            retry++;

            if (scrollContainer.scrollTop === lastScroll) break;
        }

        // 最终扫尾
        document.querySelectorAll('tr.TB_tr_5-120-1').forEach(row => {
            if (checkRow(row)) {
                if (uncheckRow(row)) cancelCount++;
            }
        });

        alert(`✅ 执行完成！
填充商品：${fillCount} 个
取消超价勾选：${cancelCount} 个`);

        return cancelCount;
    }

    // ===================== 按钮样式 =====================
    GM_addStyle(`
        #autoAllBtn {
            position: fixed; top: 80px; right: 20px; z-index: 999999;
            width: 220px; height: 55px; font-size: 16px; font-weight: bold;
            background: #ff3333; color: #fff; border-radius: 8px; cursor: pointer;
        }
        #autoAllBtn:disabled { opacity: 0.6; }
    `);

    // 创建一键全自动按钮
    function createAutoBtn() {
        const old = document.getElementById('autoAllBtn');
        if (old) old.remove();

        const btn = document.createElement('button');
        btn.id = 'autoAllBtn';
        btn.innerText = '✅ 一键填充+取消超价勾选';

        btn.onclick = async () => {
            if (isRunning) return;
            isRunning = true;
            btn.disabled = true;
            btn.innerText = '⏳ 滚动+填充+检测+取消中...';

            try {
                await scrollFillCheckUncheck();
            } catch (e) {
                alert('❌ 执行失败');
            } finally {
                isRunning = false;
                btn.disabled = false;
                btn.innerText = '✅ 一键填充+取消超价勾选';
            }
        };

        document.body.appendChild(btn);
    }

    // 启动
    setTimeout(() => {
        createAutoBtn();
        console.log('✅ 终极脚本加载完成：边滚动边取消');
    }, 2000);

})();
