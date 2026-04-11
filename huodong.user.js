// ==UserScript==
// @name         Temu服装活动报名（价格填充+取消勾选）
// @namespace    http://tampermonkey.net/
// @version      3.0
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

    const manualEditedInputs = new WeakSet();
    let isPriceFilling = false;
    let isCheckCanceling = false;
    const DEFAULT_PRICE = 999;
    const DEFAULT_STOCK = 100; // 默认库存

    // ===================== 核心修复：强制赋值（兼容React/虚拟滚动） =====================
    function forceSetInputValue(input, value) {
        if (!input || manualEditedInputs.has(input)) return;

        try {
            // 原生底层赋值，100%骗过框架
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, value);

            // 触发框架识别事件
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
        } catch (e) {}
    }

    // ===================== 单行列填充 =====================
    function fillRowPrice(row) {
        const text = row.textContent || '';
        const skuMatch = text.match(/货号[:\s]+([A-Za-z0-9-]+)/);
        if (!skuMatch) return false;

        const sku = skuMatch[1].trim();
        const price = skuPriceMap[sku] || DEFAULT_PRICE;

        // 定位活动申报价格输入框
        const priceInput = row.querySelector('input[currency="CNY"][data-testid="beast-core-inputNumber-htmlInput"]');
        // 定位活动库存输入框
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

    // ===================== 终极方案：逐行滚动加载+全量填充（解决虚拟滚动） =====================
    async function autoScrollAndFill() {
        // 精准定位虚拟滚动容器
        const scrollContainer = document.querySelector('div.TB_body_5-120-1 > div[style*="overflow-y"]') ||
                               document.querySelector('div[class*="body"] div[style*="overflow-y"]');

        if (!scrollContainer) {
            console.warn("未找到滚动容器，尝试直接填充");
            let count = 0;
            document.querySelectorAll('tr.TB_tr_5-120-1').forEach(row => {
                if(fillRowPrice(row)) count++;
            });
            return count;
        }

        let fillCount = 0;
        let lastScrollTop = -1;
        const scrollStep = 50; // 每次滚动50px，逐行加载
        const maxRetry = 500; // 最大滚动次数，防止死循环
        let retryCount = 0;

        // 重置滚动到顶部
        scrollContainer.scrollTop = 0;
        await new Promise(r => setTimeout(r, 300));

        // 逐行滚动，加载所有数据并实时填充
        while (retryCount < maxRetry) {
            // 填充当前可视区域所有行
            const currentRows = document.querySelectorAll('tr.TB_tr_5-120-1');
            currentRows.forEach(row => {
                if (fillRowPrice(row)) fillCount++;
            });

            // 记录当前滚动位置
            lastScrollTop = scrollContainer.scrollTop;
            // 向下滚动
            scrollContainer.scrollTop += scrollStep;
            // 等待渲染
            await new Promise(r => setTimeout(r, 80));
            retryCount++;

            // 滚动到底部，退出循环
            if (scrollContainer.scrollTop === lastScrollTop) {
                break;
            }
        }

        // 最后兜底填充一次所有行
        document.querySelectorAll('tr.TB_tr_5-120-1').forEach(row => {
            if (fillRowPrice(row)) fillCount++;
        });

        console.log(`✅ 全量填充完成：总计填充 ${fillCount} 个商品`);
        return fillCount;
    }

    // ===================== 取消违规勾选 =====================
    async function autoUncheckInvalidItems() {
        let count = 0;
        const keywords = ['不可大于参考价格', '输入值需大于0', '价格错误', '违规'];

        document.querySelectorAll('span[style*="red"], .ant-form-item-explain-error, .Form_itemError_5-120-1').forEach(tip => {
            const text = tip.textContent || '';
            if (keywords.some(k => text.includes(k))) {
                const row = tip.closest('tr.TB_tr_5-120-1');
                if (!row) return;

                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox && checkbox.checked) {
                    checkbox.checked = false;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    count++;
                }
            }
        });
        return count;
    }

    // ===================== 按钮样式 =====================
    GM_addStyle(`
        #fillPriceBtn, #cancelCheckBtn {
            position: fixed; top: 80px; z-index: 999999;
            width: 180px; height: 50px; font-size: 16px; font-weight: bold;
            border: 2px solid #fff; border-radius: 8px; color: #fff; cursor: pointer;
            transition: all 0.2s;
        }
        #fillPriceBtn { right: 210px; background: #00c800; }
        #cancelCheckBtn { right: 20px; background: #ff3333; }
        #fillPriceBtn:disabled, #cancelCheckBtn:disabled { opacity: 0.6; cursor: not-allowed; }
    `);

    // 创建填充按钮
    function createFillBtn() {
        const old = document.getElementById('fillPriceBtn');
        if (old) old.remove();

        const btn = document.createElement('button');
        btn.id = 'fillPriceBtn';
        btn.innerText = '✅ 一键填充所有价格';

        btn.onclick = async () => {
            if (isPriceFilling) return;
            isPriceFilling = true;
            btn.disabled = true;
            btn.innerText = '⏳ 逐行加载填充中...';

            try {
                const num = await autoScrollAndFill();
                alert(`✅ 填充完成！共成功填充 ${num} 个商品价格+库存`);
            } catch (e) {
                alert('❌ 填充失败：' + e.message);
            } finally {
                isPriceFilling = false;
                btn.disabled = false;
                btn.innerText = '✅ 一键填充所有价格';
            }
        };
        document.body.appendChild(btn);
    }

    // 创建取消勾选按钮
    function createCancelBtn() {
        const old = document.getElementById('cancelCheckBtn');
        if (old) old.remove();

        const btn = document.createElement('button');
        btn.id = 'cancelCheckBtn';
        btn.innerText = '❌ 取消违规商品勾选';

        btn.onclick = async () => {
            if (isCheckCanceling) return;
            isCheckCanceling = true;
            btn.disabled = true;
            btn.innerText = '⏳ 执行中...';

            try {
                const num = await autoUncheckInvalidItems();
                alert(num ? `✅ 已取消 ${num} 个违规商品勾选` : '⚠️ 未找到违规商品');
            } catch (e) {
                alert('❌ 执行失败');
            } finally {
                isCheckCanceling = false;
                btn.disabled = false;
                btn.innerText = '❌ 取消违规商品勾选';
            }
        };
        document.body.appendChild(btn);
    }

    // ===================== 启动脚本 =====================
    setTimeout(() => {
        createFillBtn();
        createCancelBtn();
        console.log('✅ Temu报名脚本V3.0已加载完成');
    }, 2000);

})();
    }
    window.addEventListener('load', init);
    setTimeout(init, 1000);

})();
