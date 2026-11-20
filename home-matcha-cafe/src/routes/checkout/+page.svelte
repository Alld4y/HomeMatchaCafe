<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount, getContext } from 'svelte';
    import swal from 'sweetalert2';

    const cart = getContext<any>('cartData');
    const memberCtx = getContext<any>('memberData');

    let qrImageUrl = $state<string>('');
    let baseCartTotal = $state<number>(0);
    let totalPrice = $state<number>(0);
    let userData = $state<any>(null);
    let storedBasket = $state<any[]>([]);
    let promptpayId = $state<string>('0966514809');
    let promptpayName = $state<string>('ทิพย์สุดา มณฑา');
    let isTestMode = $state<boolean>(false);

    // สิทธิ์แลกแก้วฟรีจากบัตรสะสมแต้ม
    let checkoutMember = $state<any>(null);
    let loyaltyEnabled = $state<boolean>(true);
    let stampsRequired = $state<number>(10);
    let redeemableItemIds = $state<string[]>([
        'pure-matcha',
        'matcha-latte',
        'matcha-coconut',
        'matcha-latte-oat',
        'cold-fermented-matcha-oat-latte'
    ]);
    let allMenusMap = $state<Record<string, string>>({
        'pure-matcha': 'เพียวมัทฉะ',
        'matcha-latte': 'มัทฉะลาเต้',
        'matcha-coconut': 'มัทฉะมะพร้าว',
        'matcha-latte-oat': 'มัทฉะลาเต้นมโอ๊ต',
        'matcha-oat-latte': 'มัทฉะลาเต้นมโอ๊ต',
        'cold-fermented-matcha-oat-latte': 'มัทฉะลาเต้นมโอ๊ตบ่ม'
    });
    let useFreeCupReward = $state<boolean>(false);

    let eligibleBasketItems = $derived.by(() => {
        if (!storedBasket || storedBasket.length === 0) return [];
        return storedBasket.filter((i: any) => {
            if ((i.quantity || 0) <= 0) return false;
            // รองรับทั้งรหัส matcha-latte-oat และ matcha-oat-latte
            if (redeemableItemIds.includes(i.id)) return true;
            if (i.id === 'matcha-oat-latte' && redeemableItemIds.includes('matcha-latte-oat')) return true;
            if (i.id === 'matcha-latte-oat' && redeemableItemIds.includes('matcha-oat-latte')) return true;
            return false;
        });
    });

    let redeemableMenuNamesText = $derived.by(() => {
        if (!redeemableItemIds || redeemableItemIds.length === 0) return 'ยังไม่มีเมนูที่เปิดให้แลกฟรี';
        return redeemableItemIds.map((id) => allMenusMap[id] || id).join(', ');
    });

    function getBaseDrinkPrice(item: any): number {
        if (!item) return 55;
        if (Number(item.basePrice) > 0) return Number(item.basePrice);
        const total = Number(item.price) || 55;
        const addon = Number(item.addonPrice) || 0;
        return Math.max(0, total - addon) || total;
    }

    let freeCupDiscount = $derived.by(() => {
        if (!useFreeCupReward || eligibleBasketItems.length === 0) return 0;
        // ลดเฉพาะราคาเครื่องดื่มปกติ 1 แก้ว (ส่วนค่าเพิ่มช็อตลูกค้าชำระตามจริง)
        return getBaseDrinkPrice(eligibleBasketItems[0]);
    });

    // เวลาที่แสดง QR Code และเวลาหมดอายุ (1 ชั่วโมง)
    let qrGeneratedAt = $state<string>('');
    let qrExpiresAt = $state<string>('');
    let remainingSeconds = $state<number>(3600);
    let isQrExpired = $derived(remainingSeconds <= 0);

    let selectedFile = $state<File | null>(null);
    let previewUrl = $state<string>('');
    let errorMessage = $state<string>('');
    let isLoading = $state<boolean>(false);
    let isFetchingQR = $state<boolean>(true);
    let isLineBrowser = $state<boolean>(false);

    // Modal สั่งซื้อสำเร็จแบบค้างบนหน้าจอ
    let showSuccessModal = $state<boolean>(false);
    let successData = $state<{ orderId: string; isManualReview: boolean } | null>(null);
    let isSubmittingLock = $state<boolean>(false);

    let fileInputRef!: HTMLInputElement;

    function getBasketSignature(items: any[], targetTotal: number, freeRewardUsed: boolean): string {
        const cleanItems = (items || [])
            .filter(i => Number(i.quantity || 0) > 0)
            .map(i => `${i.id}:${i.quantity}:${i.price}:${i.sweetness ?? 50}:${i.addonName || ''}`)
            .join(',');
        return `${cleanItems}|total=${targetTotal}|free=${freeRewardUsed}`;
    }

    function formatPromptPay(id: string) {
        if (!id) return '';
        const clean = id.replace(/[^0-9]/g, '');
        if (clean.length === 10) {
            return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
        }
        if (clean.length === 13) {
            return clean.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5');
        }
        return id;
    }

    function formatShortTime(isoStr: string) {
        if (!isoStr) return '-';
        try {
            const d = new Date(isoStr);
            return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' น.';
        } catch {
            return '-';
        }
    }

    function formatCountdown(sec: number) {
        if (sec <= 0) return 'หมดเวลา 1 ชั่วโมงแล้ว';
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m} นาที ${String(s).padStart(2, '0')} วินาที`;
    }

    let hasHandledExpired = false;

    function handleExpiredCart() {
        if (hasHandledExpired || showSuccessModal) return;
        hasHandledExpired = true;

        // ล้างตะกร้าสินค้าและ Session ทันที
        cart.clearCart();
        storedBasket = [];
        localStorage.removeItem('basket');
        localStorage.removeItem('hmc_qr_session');
        localStorage.removeItem('qrDataUrl');

        swal.fire({
            icon: 'warning',
            title: 'QR Code หมดอายุแล้ว (เกิน 1 ชั่วโมง)',
            text: 'เนื่องจากไม่มีการชำระเงินภายในเวลา 1 ชั่วโมง ระบบได้ทำการยกเลิกและนำสินค้าออกจากตะกร้าเรียบร้อยแล้ว กรุณาเลือกสั่งเครื่องดื่มใหม่อีกครั้งนะคะ 🍵',
            confirmButtonColor: '#456f2f',
            confirmButtonText: 'กลับไปหน้าเมนู',
            allowOutsideClick: false
        }).then(() => {
            goto('/menu');
        });
    }

    function updateCountdown() {
        if (!qrExpiresAt) return;
        const expMs = new Date(qrExpiresAt).getTime();
        const diffSec = Math.floor((expMs - Date.now()) / 1000);
        remainingSeconds = Math.max(0, diffSec);
        if (remainingSeconds <= 0 && !hasHandledExpired && !showSuccessModal) {
            handleExpiredCart();
        }
    }

    async function generateNewQR(forceNewTimestamp = false) {
        try {
            isFetchingQR = true;
            const netCartAmount = Math.max(0, baseCartTotal - (useFreeCupReward ? freeCupDiscount : 0));
            totalPrice = netCartAmount;

            if (netCartAmount === 0 && useFreeCupReward) {
                qrImageUrl = '';
                isFetchingQR = false;
                return;
            }

            const currentSignature = getBasketSignature(storedBasket, netCartAmount, useFreeCupReward);

            // ตรวจสอบว่าเคยสร้าง QR Code ของ "ตะกร้าและราคานี้" ไว้แล้วหรือไม่
            // หากลูกค้ากลับไปเพิ่ม/ลดเมนู หรือราคาเปลี่ยน จะไม่ใช้ QR เดิม แต่จะรีเซ็ตเวลาและสร้าง QR ราคาใหม่ทันที!
            if (!forceNewTimestamp) {
                const savedSessionRaw = localStorage.getItem('hmc_qr_session');
                if (savedSessionRaw) {
                    try {
                        const saved = JSON.parse(savedSessionRaw);
                        const isSameCartAndPrice =
                            saved.basketSignature === currentSignature &&
                            Number(saved.netCartAmount) === Number(netCartAmount);

                        if (isSameCartAndPrice && saved.qrDataUrl && saved.qrGeneratedAt && saved.expiresAt) {
                            const expMs = new Date(saved.expiresAt).getTime();
                            if (expMs <= Date.now()) {
                                isFetchingQR = false;
                                handleExpiredCart();
                                return;
                            }

                            qrImageUrl = saved.qrDataUrl;
                            qrGeneratedAt = saved.qrGeneratedAt;
                            qrExpiresAt = saved.expiresAt;
                            if (saved.isTestMode && saved.amount) {
                                totalPrice = saved.amount;
                                isTestMode = true;
                            } else {
                                totalPrice = netCartAmount;
                                isTestMode = false;
                            }
                            if (saved.promptpayId) promptpayId = saved.promptpayId;
                            if (saved.accountName) promptpayName = saved.accountName;
                            updateCountdown();
                            isFetchingQR = false;
                            return;
                        }
                    } catch {
                        // ignore parse error
                    }
                }
            }

            // หากตะกร้าหรือราคาเปลี่ยน ให้ล้างสลิปที่อาจเลือกค้างไว้และขอ QR ใหม่พร้อมรีเซ็ตเวลา 1 ชม.
            const res = await fetch('/api/qrcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ totalPrice: netCartAmount || 55 })
            });
            const data = await res.json();
            if (data.qrDataUrl) {
                qrImageUrl = data.qrDataUrl;
            }
            if (data.isTestMode && data.amount) {
                totalPrice = data.amount;
                isTestMode = true;
            } else {
                totalPrice = netCartAmount;
                isTestMode = false;
            }
            if (data.promptpayId) {
                promptpayId = data.promptpayId;
            }
            if (data.accountName) {
                promptpayName = data.accountName;
            }
            qrGeneratedAt = data.qrGeneratedAt || new Date().toISOString();
            qrExpiresAt = data.expiresAt || new Date(Date.now() + 3600 * 1000).toISOString();

            localStorage.setItem(
                'hmc_qr_session',
                JSON.stringify({
                    basketSignature: currentSignature,
                    netCartAmount,
                    qrDataUrl: qrImageUrl,
                    amount: totalPrice,
                    isTestMode,
                    promptpayId,
                    accountName: promptpayName,
                    qrGeneratedAt,
                    expiresAt: qrExpiresAt
                })
            );

            updateCountdown();
        } catch (e) {
            console.error('Failed to generate QR:', e);
        } finally {
            isFetchingQR = false;
        }
    }

    async function toggleFreeCupReward() {
        if (!useFreeCupReward && eligibleBasketItems.length === 0) {
            swal.fire({
                icon: 'info',
                title: 'ไม่มีเมนูที่ร่วมรายการแลกฟรีในตะกร้า',
                text: `เมนูที่อนุญาตให้ใช้แต้มแลกฟรีได้แก่: ${redeemableMenuNamesText}`,
                confirmButtonColor: '#456f2f',
                confirmButtonText: 'ตกลง'
            });
            return;
        }
        useFreeCupReward = !useFreeCupReward;
        await generateNewQR(true);
    }

    function getLineExternalUrl(): string {
        if (typeof window === 'undefined') return '';
        const url = new URL(window.location.href);
        url.searchParams.set('openExternalBrowser', '1');
        return url.toString();
    }

    async function fallbackDownloadRawQR() {
        if (!qrImageUrl) return;
        const fileName = `payment-qr-${totalPrice}baht.png`;
        try {
            const res = await fetch(qrImageUrl);
            const blob = await res.blob();
            const file = new File([blob], fileName, { type: 'image/png' });
            if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'QR Code ชำระเงิน Home Matcha Cafe',
                        text: `QR Code ชำระเงินยอด ${totalPrice} บาท ร้าน Home Matcha Cafe`
                    });
                    return;
                } catch (shareErr: any) {
                    if (shareErr.name === 'AbortError') return;
                }
            }
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
        } catch {
            const link = document.createElement('a');
            link.href = qrImageUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    async function downloadQRWithDetails() {
        if (!qrImageUrl) return;
        try {
            const qrImg = new Image();
            qrImg.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
                qrImg.onload = () => resolve();
                qrImg.onerror = (err) => reject(err);
                qrImg.src = qrImageUrl;
            });

            const canvas = document.createElement('canvas');
            const width = 720;
            const height = 940;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // พื้นหลังการ์ดโทนมัทฉะอ่อน
            ctx.fillStyle = '#f5f9f2';
            ctx.fillRect(0, 0, width, height);

            // กรอบการ์ดสีขาวด้านใน
            const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
            };

            drawRoundedRect(32, 32, width - 64, height - 64, 28);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#cfe4c3';
            ctx.stroke();

            // แถบหัวข้อด้านบน
            drawRoundedRect(64, 62, width - 128, 78, 18);
            ctx.fillStyle = '#26461b';
            ctx.fill();

            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText('🍵 Home Matcha Cafe', width / 2, 102);
            ctx.fillStyle = '#dcfce7';
            ctx.font = '600 18px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText('PromptPay QR พร้อมเพย์ · รพ.ทองผาภูมิ', width / 2, 128);

            // กล่องวางรูป QR Code
            const qrSize = 360;
            const qrX = (width - qrSize) / 2;
            const qrY = 165;

            drawRoundedRect(qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 20);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#dcebd3';
            ctx.stroke();

            ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

            // ชื่อบัญชี และ พร้อมเพย์
            ctx.fillStyle = '#1b3614';
            ctx.font = 'bold 28px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText(`ชื่อบัญชี: ${promptpayName}`, width / 2, 582);

            ctx.fillStyle = '#365829';
            ctx.font = '600 22px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText(`พร้อมเพย์: ${formatPromptPay(promptpayId)}`, width / 2, 618);

            // กล่องแสดงราคา / ยอดชำระสุทธิ
            drawRoundedRect(68, 646, width - 136, 92, 18);
            ctx.fillStyle = '#f0fdf4';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#86efac';
            ctx.stroke();

            ctx.fillStyle = '#166534';
            ctx.font = 'bold 22px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText('ยอดชำระสุทธิ', width / 2, 682);

            ctx.fillStyle = '#14532d';
            ctx.font = 'bold 38px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText(`${totalPrice} บาท`, width / 2, 724);

            // กล่องแจ้งเตือนเวลาที่ต้องโอนก่อน
            drawRoundedRect(68, 758, width - 136, 118, 16);
            ctx.fillStyle = '#fffbeb';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fde68a';
            ctx.stroke();

            const expTimeText = formatShortTime(qrExpiresAt);
            const genTimeText = formatShortTime(qrGeneratedAt);

            ctx.fillStyle = '#92400e';
            ctx.font = 'bold 21px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText(`⏱️ กรุณาชำระเงินตามจำนวน ${totalPrice} บาท`, width / 2, 795);

            ctx.fillStyle = '#b45309';
            ctx.font = 'bold 23px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText(`และดำเนินการชำระภายในเวลา ${expTimeText}`, width / 2, 830);

            ctx.fillStyle = '#78350f';
            ctx.font = '500 17px "Prompt", "Noto Sans Thai", sans-serif';
            ctx.fillText(`(สร้าง QR Code เมื่อเวลา ${genTimeText})`, width / 2, 860);

            // แปลง canvas เป็น Blob และ File เพื่อรองรับ Web Share API บน LINE / Mobile Browser
            const fileName = `home-matcha-qr-${totalPrice}baht.png`;
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

            if (blob) {
                const file = new File([blob], fileName, { type: 'image/png' });

                // ตรวจสอบ Web Share API (มือถือ / LINE In-App Browser)
                if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'QR Code ชำระเงิน Home Matcha Cafe',
                            text: `QR Code ชำระเงินยอด ${totalPrice} บาท ร้าน Home Matcha Cafe`
                        });
                        return;
                    } catch (shareErr: any) {
                        if (shareErr.name === 'AbortError') {
                            return; // ผู้ใช้กดยกเลิกแชร์เอง
                        }
                        console.warn('Web Share API failed, falling back to download:', shareErr);
                    }
                }

                // Fallback สำหรับคอมพิวเตอร์ หรืออุปกรณ์ที่ไม่รองรับ Web Share API
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
            } else {
                const dataUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (err) {
            console.error('Error generating QR card image:', err);
            await fallbackDownloadRawQR();
        }
    }

    onMount(() => {
        // ตรวจสอบกรณีลูกค้าเปิดผ่าน LINE In-App Browser
        if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
            isLineBrowser = /Line\//i.test(navigator.userAgent);
            const hasExternal = window.location.search.includes('openExternalBrowser=1');
            if (isLineBrowser && !hasExternal) {
                const url = new URL(window.location.href);
                url.searchParams.set('openExternalBrowser', '1');
                window.location.replace(url.toString());
                return;
            }
        }

        // 1. ดึงรายการสินค้าในตะกร้าล่าสุดเป็นหลักเสมอ (เพื่อให้เวลากลับไปเพิ่มเมนูแล้วได้ราคาล่าสุดทันที)
        const rawBasket = localStorage.getItem('basket');
        if (rawBasket) {
            try {
                storedBasket = JSON.parse(rawBasket).filter((it: any) => Number(it.quantity || 0) > 0);
            } catch (e) {
                console.error(e);
            }
        }
        if ((!storedBasket || storedBasket.length === 0) && cart.items?.length > 0) {
            storedBasket = cart.items;
        }

        const calculatedFromBasket = (storedBasket || []).reduce(
            (sum: number, it: any) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
            0
        );

        if ((!storedBasket || storedBasket.length === 0) && (!cart.items || cart.items.length === 0)) {
            swal.fire({
                icon: 'warning',
                title: 'ไม่มีสินค้าในตะกร้า',
                text: 'กรุณาเลือกเครื่องดื่มก่อนดำเนินการชำระเงินนะคะ',
                confirmButtonColor: '#456f2f',
                confirmButtonText: 'ไปเลือกเมนู'
            }).then(() => {
                goto('/menu');
            });
            return;
        }

        const rawUserData = localStorage.getItem('userData');
        if (rawUserData) {
            try {
                userData = JSON.parse(rawUserData);
            } catch (e) {
                console.error(e);
            }
        }

        // ใช้ยอดรวมจากตะกร้าปัจจุบันเสมอ เพื่อป้องกันปัญหากลับไปเพิ่มเมนูแล้วยอดเงินค้างเป็นยอดเก่า
        baseCartTotal = calculatedFromBasket > 0 ? calculatedFromBasket : Number(userData?.totalPrice || cart.total || 0);
        totalPrice = baseCartTotal;

        if (userData && baseCartTotal > 0 && Number(userData.totalPrice) !== baseCartTotal) {
            userData.totalPrice = baseCartTotal;
            localStorage.setItem('userData', JSON.stringify(userData));
        }

        if (!userData || !userData.name || !userData.phone) {
            swal.fire({
                icon: 'info',
                title: 'กรุณาระบุข้อมูลจัดส่ง',
                text: 'ยังไม่พบข้อมูลผู้รับ กรุณาระบุชื่อและสถานที่จัดส่งก่อนนะครับ',
                confirmButtonColor: '#456f2f',
                confirmButtonText: 'ไปกรอกข้อมูลจัดส่ง'
            }).then(() => {
                goto('/location');
            });
            return;
        }

        // โหลดรายชื่อเมนูเพื่อแสดงชื่อเมนูที่อนุญาตให้แลกฟรี
        fetch('/api/menus')
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data.items) && data.items.length > 0) {
                    const nextMap: Record<string, string> = { ...allMenusMap };
                    for (const item of data.items) {
                        if (item.id && item.thaiName) {
                            nextMap[item.id] = item.thaiName;
                        }
                    }
                    allMenusMap = nextMap;
                }
            })
            .catch(() => {});

        // โหลดข้อมูลแต้มสะสมของเบอร์โทรที่สั่งซื้อ + เมนูที่อนุญาตให้แลกฟรี
        fetch(`/api/members?phone=${encodeURIComponent(userData.phone)}`)
            .then(r => r.json())
            .then(data => {
                if (data.loyaltySettings) {
                    loyaltyEnabled = data.loyaltySettings.enabled !== false;
                    stampsRequired = Number(data.loyaltySettings.stampsRequired) || 10;
                    if (Array.isArray(data.loyaltySettings.redeemableItemIds)) {
                        redeemableItemIds = data.loyaltySettings.redeemableItemIds;
                    }
                    if (!loyaltyEnabled && useFreeCupReward) {
                        useFreeCupReward = false;
                        generateNewQR(true);
                    }
                }
                if (data.member) {
                    checkoutMember = data.member;
                }
            })
            .catch(() => {});

        generateNewQR(false);

        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    });

    function triggerFileInput() {
        if (fileInputRef) {
            fileInputRef.click();
        }
    }

    async function compressImageIfNeeded(file: File): Promise<File> {
        // หากไฟล์ขนาดเล็กกว่า 300KB อยู่แล้ว ไม่จำเป็นต้องบีบอัด
        if (file.size <= 300 * 1024) return file;

        return new Promise((resolve) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                const maxDim = 1200;
                let w = img.width;
                let h = img.height;

                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(file);
                    return;
                }

                ctx.drawImage(img, 0, 0, w, h);

                const tryCompress = (quality: number) => {
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                resolve(file);
                                return;
                            }
                            // หากยังเกิน 380KB และคุณภาพยังลดได้ ให้ลดคุณภาพลงเพื่อความรวดเร็วและไม่เกินลิมิต
                            if (blob.size > 380 * 1024 && quality > 0.45) {
                                tryCompress(quality - 0.15);
                                return;
                            }
                            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(compressed);
                        },
                        'image/jpeg',
                        quality
                    );
                };

                tryCompress(0.8);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
            };
            img.src = objectUrl;
        });
    }

    async function handleFileChange(event: Event) {
        const target = event.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            const original = target.files[0];
            previewUrl = URL.createObjectURL(original);
            errorMessage = '';
            try {
                selectedFile = await compressImageIfNeeded(original);
            } catch {
                selectedFile = original;
            }
        }
    }

    function removeImage() {
        selectedFile = null;
        previewUrl = '';
        errorMessage = '';
        if (fileInputRef) fileInputRef.value = '';
    }

    function handleConfirmSuccess() {
        showSuccessModal = false;
        if (memberCtx?.refreshMember) {
            memberCtx.refreshMember();
        }
        goto('/success');
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                if (window.location.pathname !== '/success') {
                    window.location.href = '/success';
                }
            }, 300);
        }
    }

    async function handleManualReviewButtonClick() {
        if (isSubmittingLock || showSuccessModal) return;

        if (!selectedFile) {
            swal.fire({
                icon: 'warning',
                title: 'กรุณาแนบรูปสลิปก่อนครับ',
                text: 'กรุณาเลือกรูปภาพสลิปที่โอนเงินแล้วแนบไว้ด้านบน ก่อนกดปุ่มแจ้งแอดมินตรวจสอบนะครับ',
                confirmButtonColor: '#456f2f',
                confirmButtonText: 'เลือกรูปสลิป'
            }).then(() => {
                triggerFileInput();
            });
            return;
        }

        const confirmRes = await swal.fire({
            icon: 'question',
            title: 'โอนเงินแล้ว แต่สลิปใช้งานไม่ได้ใช่ไหม?',
            text: 'กดยืนยันเพื่อดำเนินการสั่งเครื่องดื่ม โดยแอดมินจะดำเนินการตรวจสอบสลิปอีกครั้ง และเริ่มจัดเตรียมออเดอร์ให้ทันทีที่ตรวจสอบยอดเงินเรียบร้อยครับ *อาจมีการล่าช้าในการตรวจสอบสลิป',
            showCancelButton: true,
            confirmButtonColor: '#456f2f',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยันการสั่งเครื่องดื่ม',
            cancelButtonText: 'ยกเลิก'
        });

        if (confirmRes.isConfirmed) {
            await submitOrder(true);
        }
    }

    async function submitOrder(forceAdminReview = false) {
        if (isSubmittingLock || showSuccessModal) return;

        const isZeroBahtFreeOrder = totalPrice === 0 && useFreeCupReward;

        if (!isZeroBahtFreeOrder && !selectedFile) {
            errorMessage = 'กรุณาแนบรูปภาพสลิปการโอนเงินเพื่อยืนยันออเดอร์';
            swal.fire({
                icon: 'warning',
                title: 'ยังไม่ได้แนบสลิป',
                text: 'กรุณาเลือกรูปภาพสลิปการโอนเงินก่อนกดยืนยันออเดอร์นะครับ',
                confirmButtonColor: '#456f2f',
                confirmButtonText: 'ตกลง'
            });
            return;
        }

        if (!userData || !userData.name || !userData.phone) {
            errorMessage = 'ไม่พบข้อมูลผู้สั่งซื้อ กรุณากลับไปกรอกข้อมูลจัดส่งใหม่';
            swal.fire({
                icon: 'warning',
                title: 'ไม่พบข้อมูลผู้สั่งซื้อ',
                text: 'กรุณาระบุชื่อ เบอร์โทรศัพท์ และสถานที่จัดส่งในโรงพยาบาลก่อนนะครับ',
                confirmButtonColor: '#456f2f',
                confirmButtonText: 'ไปกรอกข้อมูลจัดส่ง'
            }).then(() => {
                goto('/location');
            });
            return;
        }

        const isManualReview = forceAdminReview || isQrExpired;

        errorMessage = '';
        isLoading = true;
        isSubmittingLock = true;

        const formData = new FormData();
        if (selectedFile) {
            formData.append('slipImage', selectedFile);
        }
        formData.append('recipientName', userData.name || '');
        formData.append('memberName', memberCtx?.member?.fullName || userData.memberName || '');
        formData.append('phone', userData.phone || '');
        formData.append('address', userData.address || '');
        formData.append('sellerMessage', userData.message || '');
        formData.append('totalPrice', String(totalPrice));
        formData.append('basket', JSON.stringify(storedBasket || []));
        formData.append('qrGeneratedAt', qrGeneratedAt || new Date().toISOString());
        formData.append('deliveryDate', userData.deliveryDate || '');
        formData.append('deliveryRound', userData.deliveryRound || '');
        formData.append('deliveryRoundId', userData.deliveryRoundId || '');
        formData.append('useFreeCupReward', String(useFreeCupReward));
        formData.append('discountAmount', String(useFreeCupReward ? freeCupDiscount : 0));
        if (isManualReview) {
            formData.append('requestAdminReview', 'true');
        }

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                body: formData
            });

            const result = await res.json();

            if (res.ok && result.success) {
                isLoading = false;

                cart.clearCart();
                localStorage.removeItem('qrDataUrl');
                localStorage.removeItem('hmc_qr_session');
                if (memberCtx?.refreshMember) {
                    memberCtx.refreshMember();
                }

                successData = {
                    orderId: result.order_id || result.order?.id || '',
                    isManualReview: Boolean(result.requiresManualReview)
                };
                showSuccessModal = true;
                return;
            } else {
                errorMessage = result.message || 'ไม่สามารถส่งคำสั่งซื้อได้';
                swal.fire({
                    icon: 'error',
                    title: 'ตรวจสอบสลิปไม่ผ่าน',
                    text: `${result.message || 'รูปภาพที่แนบไม่ผ่านการตรวจสอบ'} (หากคุณโอนเงินแล้วแต่สลิปยืนยันไม่ผ่าน สามารถกดปุ่ม "โอนเงินไปแล้ว แต่ยืนยันไม่ผ่าน" ด้านล่างสุดของหน้าจอได้ครับ)`,
                    confirmButtonColor: '#d9483b',
                    confirmButtonText: 'ตกลง'
                });
            }
        } catch (error) {
            console.error('Error submitting order:', error);
            swal.fire({
                icon: 'error',
                title: 'เชื่อมต่อขัดข้อง',
                text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
                confirmButtonColor: '#d9483b'
            });
        } finally {
            isLoading = false;
            if (!showSuccessModal) {
                isSubmittingLock = false;
            }
        }
    }
</script>

<svelte:head>
    <title>ชำระเงินผ่าน PromptPay | Home Matcha Cafe</title>
</svelte:head>

<main class="menu-page-wrapper">
    <!-- Stepper Navigation -->
    <div class="checkout-steps">
        <div class="step-item done">
            <div class="step-circle">✓</div>
            <span>เลือกเมนู</span>
        </div>
        <div class="step-line done"></div>
        <div class="step-item done">
            <div class="step-circle">✓</div>
            <span>สถานที่จัดส่ง</span>
        </div>
        <div class="step-line done"></div>
        <div class="step-item active">
            <div class="step-circle">3</div>
            <span>ชำระเงิน</span>
        </div>
    </div>

    <!-- 🌟 Pop-up แสดงสถานะสั่งสำเร็จ (ค้างไว้บนหน้าจอจนกว่าผู้ใช้จะกดปุ่ม ตกลง) -->
    {#if showSuccessModal && successData}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
            style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999999; padding: 1.25rem;"
            onclick={(e) => e.stopPropagation()}
        >
            <div 
                style="background: #ffffff; border-radius: 28px; max-width: 440px; width: 100%; padding: 2.25rem 1.75rem; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.45); animation: popModal 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);"
                onclick={(e) => e.stopPropagation()}
            >
                <div style="width: 80px; height: 80px; border-radius: 50%; background: {successData.isManualReview ? '#fef3c7' : '#dcfce7'}; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; margin: 0 auto 1.25rem auto;">
                    {successData.isManualReview ? '🔔' : '✅'}
                </div>

                <h2 style="margin: 0 0 0.5rem 0; font-size: 1.65rem; color: {successData.isManualReview ? '#92400e' : '#166534'}; font-weight: 800;">
                    {successData.isManualReview ? 'ส่งคำขอให้แอดมินตรวจสลิปแล้ว!' : 'สั่งสำเร็จ!'}
                </h2>

                <p style="margin: 0 0 0.6rem 0; font-size: 1.05rem; font-weight: 700; color: #1e3a1e;">
                    {successData.isManualReview ? 'ออเดอร์ถูกบันทึกแล้ว รอแอดมินอนุมัติสลิป' : '🎉 รับยอดเงินเรียบร้อยแล้ว'}
                </p>

                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 14px; padding: 0.85rem 1rem; margin: 0.85rem 0 1.15rem 0;">
                    <p style="margin: 0; font-size: 0.8rem; color: #64748b;">รหัสคำสั่งซื้อของคุณ</p>
                    <p style="margin: 0.2rem 0 0 0; font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 800; color: #0f172a; letter-spacing: 0.5px;">
                        {successData.orderId}
                    </p>
                </div>

                <p style="margin: 0 0 1.5rem 0; font-size: 0.875rem; color: #64748b; line-height: 1.55;">
                    {successData.isManualReview 
                        ? 'ระบบได้ส่งแจ้งเตือนไปยังหน้าแอดมินเพื่อตรวจสอบสลิปของคุณด้วยตนเองเรียบร้อยแล้วครับ' 
                        : 'สลิปโอนเงินผ่านการตรวจสอบถูกต้องเรียบร้อย บาริสต้ากำลังเตรียมชงเครื่องดื่มให้คุณครับ'}
                </p>

                <button
                    type="button"
                    onclick={handleConfirmSuccess}
                    class="btn-matcha-primary"
                    style="width: 100%; padding: 0.95rem; font-size: 1.15rem; font-weight: 800; border-radius: 999px; box-shadow: 0 4px 15px rgba(69, 111, 47, 0.35); cursor: pointer;"
                >
                    ตกลง
                </button>
            </div>
        </div>
    {/if}

    <!-- Loading Overlay -->
    {#if isLoading}
        <div style="position: fixed; inset: 0; background: rgba(27, 45, 22, 0.85); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 99999; color: #ffffff;">
            <div class="spinner-white spinner" style="width: 50px; height: 50px; margin-bottom: 1.5rem;"></div>
            <h2 style="margin: 0 0 0.5rem 0; font-size: 1.4rem;">กำลังตรวจสอบสลิป (QR + ยอดเงิน + เวลาโอน)</h2>
            <p style="margin: 0; color: var(--matcha-soft); font-size: 0.9rem;">กรุณารอสักครู่นะครับ...</p>
        </div>
    {/if}

    <div class="checkout-card">
        {#if isTestMode}
            <div style="background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 0.4rem 0.85rem; border-radius: var(--radius-full); font-size: 0.8rem; font-weight: 700; margin-bottom: 0.65rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                <span>🧪 โหมดทดสอบการโอนเงิน (บังคับยอด {totalPrice} บาท จาก .env)</span>
            </div>
        {:else}
            <span class="status-pill paid" style="margin-bottom: 0.5rem;">PromptPay QR พร้อมเพย์</span>
        {/if}
        <h1 style="margin: 0 0 0.25rem 0; font-size: 1.6rem; color: var(--matcha-deep);">สแกนจ่ายค่าเครื่องดื่ม</h1>
        <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">
            ยอดชำระสุทธิ: <strong style="font-family: 'Outfit', sans-serif; font-size: 1.4rem; color: var(--matcha-dark);">{totalPrice} บาท</strong>
            {#if useFreeCupReward}
                <span style="font-size: 0.8rem; color: #16a34a; font-weight: 700;"> (ลดแก้วฟรี -{freeCupDiscount} ฿)</span>
            {/if}
        </p>

        <!-- กล่องใช้สิทธิ์แลกแก้วฟรี (แสดงเมื่อเปิดระบบสะสมแต้มและสมาชิกสะสมแต้มครบกำหนด) -->
        {#if loyaltyEnabled && checkoutMember && checkoutMember.points >= stampsRequired}
            <div style="width: 100%; margin-top: 0.75rem; padding: 0.75rem 1rem; border-radius: 14px; background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1.5px solid #86efac; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <div style="text-align: left; flex: 1; min-width: 180px;">
                    <p style="margin: 0; font-size: 0.86rem; font-weight: 800; color: #14532d;">
                        🎁 คุณมีแต้มสะสม {checkoutMember.points}/{stampsRequired} ดวง!
                    </p>
                    {#if eligibleBasketItems.length > 0}
                        <p style="margin: 0.1rem 0 0 0; font-size: 0.75rem; color: #166534;">
                            ใช้ {stampsRequired} แต้ม แลกส่วนลดฟรี 1 แก้ว ({eligibleBasketItems[0].thaiName || eligibleBasketItems[0].name || 'เมนูที่ร่วมรายการ'} ลด -{getBaseDrinkPrice(eligibleBasketItems[0])} ฿{#if eligibleBasketItems[0].addonPrice > 0} · ค่าช็อตเพิ่ม +{eligibleBasketItems[0].addonPrice} ฿ ชำระตามจริง{/if})
                        </p>
                    {:else}
                        <p style="margin: 0.1rem 0 0 0; font-size: 0.74rem; color: #b45309; font-weight: 600;">
                            ⚠️ เมนูในตะกร้าไม่ร่วมรายการแลกฟรี (เมนูที่แลกฟรีได้: {redeemableMenuNamesText})
                        </p>
                    {/if}
                </div>
                <button
                    type="button"
                    onclick={toggleFreeCupReward}
                    style="padding: 0.45rem 0.9rem; border-radius: 999px; border: none; font-size: 0.8rem; font-weight: 800; cursor: pointer; background: {useFreeCupReward ? '#dc2626' : eligibleBasketItems.length > 0 ? '#16a34a' : '#94a3b8'}; color: #ffffff;"
                >
                    {useFreeCupReward ? '✕ ยกเลิกการใช้สิทธิ์' : `✓ กดใช้สิทธิ์แลกฟรี 1 แก้ว`}
                </button>
            </div>
        {/if}

        {#if totalPrice > 0}
            {#if isLineBrowser}
                <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 0.65rem 0.9rem; margin-bottom: 0.75rem; font-size: 0.8rem; color: #166534; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <span>💬</span>
                        <span>เปิดผ่านแอป LINE: กดค้างรูป QR เพื่อบันทึก หรือเปิดด้วยเบราว์เซอร์หลัก</span>
                    </div>
                    <a
                        href={getLineExternalUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        style="background: #166534; color: #ffffff; padding: 0.25rem 0.65rem; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 0.25rem;"
                    >
                        🌐 เปิดใน Safari / Chrome
                    </a>
                </div>
            {/if}

            <!-- การ์ดแสดง QR Code -->
            <div class="qr-card-box">
                {#if isFetchingQR}
                    <div style="height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem;">
                        <div class="spinner"></div>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">กำลังสร้าง QR Code...</span>
                    </div>
                {:else if qrImageUrl}
                    <img
                        src={qrImageUrl}
                        alt="PromptPay QR Code"
                        class="qr-img"
                        style="user-select: auto; -webkit-touch-callout: default; pointer-events: auto; display: block; max-width: 100%; cursor: pointer;"
                    />
                    <!-- ข้อความแนะนำเล็กๆ ใต้รูป QR Code -->
                    <p style="margin: 0.4rem 0 0 0; font-size: 0.78rem; color: #166534; background: #f0fdf4; border: 1px dashed #86efac; border-radius: 999px; padding: 0.25rem 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 600;">
                        📱 กดค้างที่รูป QR Code เพื่อบันทึกภาพ
                    </p>

                    <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-top: 0.5rem; text-align: center;">
                        <p style="margin: 0; font-weight: 700; color: var(--matcha-deep); font-size: 0.95rem;">ชื่อบัญชี: {promptpayName}</p>
                        <p style="margin: 2px 0 0 0; color: var(--matcha-dark); font-weight: 600;">
                            พร้อมเพย์: <span style="font-family: 'Outfit', monospace; font-size: 1rem; color: var(--matcha-primary);">{formatPromptPay(promptpayId)}</span>
                        </p>
                    </div>

                    <!-- แถบแสดงเวลา QR Code และนับถอยหลัง 1 ชั่วโมง -->
                    {#if qrGeneratedAt}
                        <div style="margin-top: 0.75rem; padding: 0.6rem 0.85rem; border-radius: 10px; font-size: 0.78rem; text-align: center; background: {isQrExpired ? '#fef2f2' : '#f0fdf4'}; border: 1px solid {isQrExpired ? '#fca5a5' : '#bbf7d0'}; color: {isQrExpired ? '#b91c1c' : '#166534'};">
                            <div style="font-weight: 700; margin-bottom: 0.15rem;">
                                ⏱️ แสดง QR เมื่อ {formatShortTime(qrGeneratedAt)} · ต้องโอนภายใน {formatShortTime(qrExpiresAt)}
                            </div>
                            <div>
                                {#if isQrExpired}
                                    ⚠️ <strong>QR Code นี้หมดอายุแล้ว (เกิน 1 ชั่วโมง)</strong> ระบบได้ยกเลิกและนำสินค้าออกจากตะกร้าแล้วค่ะ
                                {:else}
                                    เวลาโอนในสลิปต้องหลัง {formatShortTime(qrGeneratedAt)} (เหลือเวลา <strong>{formatCountdown(remainingSeconds)}</strong>)
                                {/if}
                            </div>
                        </div>
                    {/if}
                {:else}
                    <div style="height: 180px; display: flex; align-items: center; justify-content: center; color: var(--red-accent);">
                        ไม่สามารถโหลด QR Code ได้
                    </div>
                {/if}
            </div>

            {#if qrImageUrl}
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-bottom: 0.5rem;">
                    <button
                        type="button"
                        onclick={downloadQRWithDetails}
                        class="btn-matcha-outline" 
                        style="padding: 0.45rem 1rem; font-size: 0.825rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        บันทึกรูป QR Code
                    </button>
                </div>
            {/if}

            <!-- กล่องอัปโหลดสลิป Drag & Drop / File Pick -->
            <input 
                type="file" 
                accept="image/*" 
                bind:this={fileInputRef} 
                onchange={handleFileChange} 
                style="display: none;" 
            />

            {#if previewUrl}
                <div class="slip-preview-container">
                    <span class="status-pill open" style="font-size: 0.75rem;">✓ เลือกรูปสลิปเรียบร้อย</span>
                    <img src={previewUrl} alt="Slip Preview" class="slip-preview-img" />
                    <button 
                        type="button" 
                        class="btn-danger" 
                        style="font-size: 0.8rem; padding: 0.35rem 0.8rem;" 
                        onclick={removeImage}
                    >
                        ✕ เปลี่ยนรูปสลิป
                    </button>
                </div>
            {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="slip-drop-zone" onclick={triggerFileInput}>
                    <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🧾</div>
                    <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--matcha-deep);">อัปโหลดสลิปการโอนเงิน</h3>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">
                        คลิกเพื่อเลือกรูปภาพสลิปที่โอนยอด <strong>{totalPrice} บาท</strong> ภายใน 1 ชม. หลังแสดง QR
                    </p>
                </div>
            {/if}
        {/if}

        {#if errorMessage}
            <div style="background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; padding: 0.75rem 1rem; border-radius: var(--radius-md); font-size: 0.85rem; font-weight: 600; margin-top: 1rem; width: 100%;">
                ⚠️ {errorMessage}
            </div>
        {/if}

        <!-- ปุ่มยืนยันการสั่งซื้อหลัก -->
        <div style="width: 100%; margin-top: 1.25rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
            <button 
                type="button"
                onclick={() => submitOrder(false)} 
                class="btn-matcha-primary" 
                style="width: 100%; padding: 0.95rem; font-size: 1.05rem;"
                disabled={isLoading || isSubmittingLock || showSuccessModal}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                {totalPrice === 0 && useFreeCupReward ? 'ยืนยันรับเครื่องดื่มฟรี (ใช้แต้มสะสม)' : 'ยืนยันการชำระเงินและส่งออเดอร์'}
            </button>

            <!-- ปุ่มด้านล่างสุดขนาดกะทัดรัด: โอนเงินไปแล้ว แต่ยืนยันไม่ผ่าน -->
            {#if totalPrice > 0}
                <button
                    type="button"
                    onclick={handleManualReviewButtonClick}
                    disabled={isLoading || isSubmittingLock || showSuccessModal}
                    style="background: #fffbeb; color: #92400e; border: 1px solid #fcd34d; padding: 0.42rem 0.95rem; border-radius: 999px; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.15s ease;"
                >
                    🙋‍♂️ โอนเงินไปแล้ว แต่ยืนยันไม่ผ่าน
                </button>
            {/if}
        </div>
    </div>
</main>