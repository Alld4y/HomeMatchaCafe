<script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { onMount, setContext } from 'svelte';
    import swal from 'sweetalert2';
    import './layout.css';
    import './CSS/main.css';
    import './CSS/menu.css';

    interface CartItem {
        id: string;
        thaiName?: string;
        englishName?: string;
        name?: string;
        price: number;
        basePrice?: number;
        addonName?: string;
        addonPrice?: number;
        quantity: number;
        sweetness?: number;
        note?: string;
    }

    interface MemberInfo {
        id: number;
        firstName: string;
        lastName: string;
        fullName: string;
        phone: string;
        points: number;
        totalStampsEarned: number;
        totalFreeRedeemed: number;
        cardStartedAt: string | null;
        cardExpiresAt: string | null;
        isCardExpired: boolean;
    }

    // State จัดการตะกร้าสินค้าแบบ Reactive ใน Svelte 5
    let basketItems = $state<CartItem[]>([]);
    let isModalOpen = $state(false);
    let adminPendingReviewCount = $state(0);

    // State สำหรับระบบสมาชิกและบัตรสะสมแต้ม
    let currentMember = $state<MemberInfo | null>(null);
    let loyaltySettings = $state<{ enabled: boolean; stampsRequired: number; expireDays: number }>({
        enabled: true,
        stampsRequired: 10,
        expireDays: 60
    });

    // Modal สมัครสมาชิก / ล็อกอิน / PIN Numpad / เมนูสมาชิก
    let showMemberAuthModal = $state(false);
    let authModalCloseCallback: (() => void) | null = null;

    function closeAuthModal() {
        showMemberAuthModal = false;
        if (authModalCloseCallback) {
            const cb = authModalCloseCallback;
            authModalCloseCallback = null;
            setTimeout(() => {
                cb();
            }, 150);
        }
    }
    let showMemberQuickModal = $state(false);
    let authMode = $state<'login' | 'register'>('login');
    let authStep = $state<'form' | 'pin'>('form');
    let authFirstName = $state('');
    let authLastName = $state('');
    let authPhone = $state('');
    let authPin = $state('');
    let authError = $state('');
    let isAuthSubmitting = $state(false);

    // คำนวณจำนวนชิ้นและราคารวม
    let totalCount = $derived(basketItems.reduce((sum, it) => sum + (it.quantity || 0), 0));
    let totalPrice = $derived(basketItems.reduce((sum, it) => sum + ((it.price || 0) * (it.quantity || 0)), 0));

    // ตรวจสอบว่าอยู่ในหน้าเมนูที่มีแถบตะกร้าด้านล่างหรือไม่ เพื่อเลื่อนปุ่มวงกลมสมาชิกขึ้นไม่ให้ทับกัน
    let shouldElevateFloatingBtn = $derived(
        page.url.pathname.startsWith('/menu') && totalCount > 0
    );

    const cartContext = {
        get items() { return basketItems; },
        set items(newVal) { basketItems = newVal; },
        get count() { return totalCount; },
        get total() { return totalPrice; },
        syncFromStorage: loadCartFromStorage,
        addItem: (item: CartItem) => {
            const itemSweet = item.sweetness ?? 50;
            const itemNote = (item.note || '').trim();
            const itemAddon = (item.addonName || '').trim();
            const idx = basketItems.findIndex(
                (i) =>
                    i.id === item.id &&
                    (i.sweetness ?? 50) === itemSweet &&
                    (i.addonName || '').trim() === itemAddon &&
                    (i.note || '').trim() === itemNote
            );
            if (idx > -1) {
                basketItems[idx].quantity += item.quantity || 1;
            } else {
                basketItems.push({
                    ...item,
                    addonName: itemAddon,
                    addonPrice: Number(item.addonPrice || 0),
                    basePrice: Number(item.basePrice) || Math.max(0, Number(item.price || 55) - Number(item.addonPrice || 0)),
                    sweetness: itemSweet,
                    note: itemNote
                });
            }
            saveCartToStorage();
        },
        removeItem: (id: string) => {
            basketItems = basketItems.filter(i => i.id !== id);
            saveCartToStorage();
        },
        updateQty: (id: string, delta: number, sweetness?: number) => {
            const it = basketItems.find(i => i.id === id && (sweetness === undefined || (i.sweetness ?? 50) === sweetness));
            if (it) {
                it.quantity += delta;
                if (it.quantity <= 0) {
                    basketItems = basketItems.filter(i => !(i.id === id && (sweetness === undefined || (i.sweetness ?? 50) === sweetness)));
                }
                saveCartToStorage();
            }
        },
        updateQtyByIndex: (idx: number, delta: number) => {
            if (basketItems[idx]) {
                basketItems[idx].quantity += delta;
                if (basketItems[idx].quantity <= 0) {
                    basketItems.splice(idx, 1);
                }
                saveCartToStorage();
            }
        },
        clearCart: () => {
            basketItems = [];
            saveCartToStorage();
        }
    };

    const memberContext = {
        get member() { return currentMember; },
        get loyaltySettings() { return loyaltySettings; },
        refreshMember: refreshCurrentMemberFromServer,
        openAuthModal: (mode: 'login' | 'register' = 'login', onClose?: () => void) => {
            authMode = mode;
            authStep = 'form';
            authPin = '';
            authError = '';
            authModalCloseCallback = onClose || null;
            showMemberAuthModal = true;
        },
        closeAuthModal,
        logout: handleMemberLogout
    };

    setContext('cartData', cartContext);
    setContext('memberData', memberContext);

    function loadCartFromStorage() {
        if (typeof window === 'undefined') return;
        try {
            // หากเคยสร้าง QR Code ไว้แล้วเกิน 1 ชั่วโมง ให้ล้างตะกร้าและ Session ทั้งหมดทิ้งอัตโนมัติ
            const rawSession = localStorage.getItem('hmc_qr_session');
            if (rawSession) {
                try {
                    const session = JSON.parse(rawSession);
                    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
                        localStorage.removeItem('hmc_qr_session');
                        localStorage.removeItem('basket');
                        localStorage.removeItem('qrDataUrl');
                        basketItems = [];
                        return;
                    }
                } catch {}
            }

            const raw = localStorage.getItem('basket');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    basketItems = parsed
                        .map(it => {
                            const price = Number(it.price) || 55;
                            const addonPrice = Number(it.addonPrice || 0);
                            return {
                                id: it.id,
                                thaiName: it.thaiName || it.name || it.id,
                                englishName: it.englishName || it.id,
                                name: it.thaiName || it.name || it.id,
                                price,
                                basePrice: Number(it.basePrice) || Math.max(0, price - addonPrice),
                                addonName: it.addonName || '',
                                addonPrice,
                                quantity: Number(it.quantity || it.qty || 0),
                                sweetness: it.sweetness ?? 50,
                                note: it.note || ''
                            };
                        })
                        .filter(it => it.quantity > 0);
                }
            }
        } catch (e) {
            console.error('Error loading basket from localStorage:', e);
        }
    }

    function saveCartToStorage() {
        if (typeof window === 'undefined') return;
        localStorage.setItem('basket', JSON.stringify(basketItems));
        // ล้าง QR Session เดิมเมื่อตะกร้ามีการเปลี่ยนแปลง เพื่อให้หน้า Checkout สร้าง QR ใหม่ตามราคาล่าสุดเสมอ
        localStorage.removeItem('hmc_qr_session');
        window.dispatchEvent(new CustomEvent('cart-updated'));
    }

    async function loadMemberFromStorage() {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem('hmc_member');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.phone) {
                    currentMember = parsed;
                    await refreshCurrentMemberFromServer(parsed.phone);
                }
            } else {
                // โหลดเฉพาะค่าตั้งค่าแต้มสะสม
                const res = await fetch('/api/members?phone=000');
                if (res.ok) {
                    const data = await res.json();
                    if (data.loyaltySettings) loyaltySettings = data.loyaltySettings;
                }
            }
        } catch (e) {
            console.error('Error loading member:', e);
        }
    }

    async function refreshCurrentMemberFromServer(phoneOverride?: string) {
        const phoneToFetch = phoneOverride || currentMember?.phone;
        if (!phoneToFetch) return;
        try {
            const res = await fetch(`/api/members?phone=${encodeURIComponent(phoneToFetch)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.loyaltySettings) {
                    loyaltySettings = data.loyaltySettings;
                }
                if (data.member) {
                    currentMember = data.member;
                    localStorage.setItem('hmc_member', JSON.stringify(data.member));
                } else if (data.exists === false) {
                    currentMember = null;
                    localStorage.removeItem('hmc_member');
                }
            }
        } catch {
            // ignore network error
        }
    }

    function handleFloatingMemberClick() {
        if (currentMember) {
            refreshCurrentMemberFromServer();
            showMemberQuickModal = true;
        } else {
            authMode = 'login';
            authStep = 'form';
            authPin = '';
            authError = '';
            showMemberAuthModal = true;
        }
    }

    async function handleProceedToPinStep() {
        authError = '';
        const cleanedPhone = authPhone.replace(/[^0-9]/g, '');
        if (cleanedPhone.length < 9 || cleanedPhone.length > 10) {
            authError = 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลักให้ถูกต้อง';
            return;
        }

        if (authMode === 'register') {
            if (!authFirstName.trim() || !authLastName.trim()) {
                authError = 'กรุณากรอกชื่อจริงและนามสกุลให้ครบถ้วน';
                return;
            }
        }

        isAuthSubmitting = true;
        try {
            const checkRes = await fetch(`/api/members?phone=${encodeURIComponent(cleanedPhone)}`);
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                if (authMode === 'login' && !checkData.exists) {
                    authError = 'ไม่พบเบอร์โทรนี้ในระบบ กรุณากดแท็บ "สมัครสมาชิก" ด้านบนค่ะ';
                    isAuthSubmitting = false;
                    return;
                }
                if (authMode === 'register' && checkData.exists) {
                    authError = 'เบอร์โทรนี้เป็นสมาชิกอยู่แล้ว กรุณากดแท็บ "เข้าสู่ระบบ" ค่ะ';
                    isAuthSubmitting = false;
                    return;
                }
            }
        } catch {
            // proceed
        } finally {
            isAuthSubmitting = false;
        }

        authPin = '';
        authStep = 'pin';
    }

    function handlePinDigit(digit: string) {
        if (isAuthSubmitting) return;
        if (authPin.length < 4) {
            authPin += digit;
            authError = '';
            if (authPin.length === 4) {
                submitAuthWithPin();
            }
        }
    }

    function handlePinBackspace() {
        if (isAuthSubmitting) return;
        authPin = authPin.slice(0, -1);
        authError = '';
    }

    function handlePinClear() {
        if (isAuthSubmitting) return;
        authPin = '';
        authError = '';
    }

    async function submitAuthWithPin() {
        if (authPin.length < 4) {
            authError = 'กรุณากดรหัส PIN ให้ครบ 4 หลัก';
            return;
        }

        isAuthSubmitting = true;
        authError = '';
        try {
            const res = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: authMode,
                    firstName: authFirstName.trim(),
                    lastName: authLastName.trim(),
                    phone: authPhone.replace(/[^0-9]/g, ''),
                    pin: authPin
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                authError = data.message || 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่';
                authPin = '';
                return;
            }

            currentMember = data.member;
            localStorage.setItem('hmc_member', JSON.stringify(data.member));
            closeAuthModal();
            authPin = '';

            swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: authMode === 'register' ? 'สมัครสมาชิกสำเร็จ! 🍵' : `ยินดีต้อนรับคุณ ${data.member.firstName} 🍵`,
                showConfirmButton: false,
                timer: 2500
            });
        } catch {
            authError = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
            authPin = '';
        } finally {
            isAuthSubmitting = false;
        }
    }

    function handleMemberLogout() {
        currentMember = null;
        localStorage.removeItem('hmc_member');
        showMemberQuickModal = false;
        swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'ออกจากระบบสมาชิกเรียบร้อยแล้ว',
            showConfirmButton: false,
            timer: 2000
        });
        if (page.url.pathname === '/loyalty') {
            goto('/');
        }
    }

    async function checkAdminPendingReviews() {
        try {
            const res = await fetch('/api/orders');
            if (res.ok) {
                const orders = await res.json();
                if (Array.isArray(orders)) {
                    adminPendingReviewCount = orders.filter((o: any) => o.status === 'pending').length;
                }
            }
        } catch {
            // ignore error
        }
    }

    // 📲 PWA & In-App Browser (LINE) Detection & Installation
    let isLineBrowser = $state(false);
    let showLineBanner = $state(false);
    let deferredInstallPrompt = $state<any>(null);
    let showInstallBanner = $state(false);
    let isIosDevice = $state(false);
    let isStandalone = $state(false);

    function openExternalBrowserFromLine() {
        const u = new URL(window.location.href);
        u.searchParams.set('openExternalBrowser', '1');
        window.location.href = u.toString();
    }

    async function handleInstallPwa() {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                showInstallBanner = false;
            }
            deferredInstallPrompt = null;
        } else if (isIosDevice) {
            swal.fire({
                title: 'วิธีติดตั้งแอปบน iPhone / iPad',
                html: `
                    <div style="text-align: left; font-size: 0.92rem; line-height: 1.6; color: #334155;">
                        <p style="margin-bottom: 0.75rem;">ติดตั้ง <strong>Home Matcha Cafe</strong> ลงบนหน้าจอโฮมได้ง่ายๆ:</p>
                        <ol style="padding-left: 1.25rem; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
                            <li>แตะปุ่มแชร์ <strong>⎋ (Share)</strong> ที่แถบด้านล่างของ Safari</li>
                            <li>เลื่อนลงแล้วเลือก <strong>"เพิ่มไปยังหน้าจอโฮม (Add to Home Screen) ＋"</strong></li>
                            <li>แตะ <strong>"เพิ่ม (Add)"</strong> ที่มุมขวาบน</li>
                        </ol>
                        <p style="margin-top: 0.75rem; font-size: 0.8rem; color: #64748b;">ไอคอนแอปจะไปปรากฏบนหน้าจอโฮม เข้าสั่งได้สะดวกรวดเร็วไม่ต้องเข้าผ่านเบราว์เซอร์ค่ะ 🍵</p>
                    </div>
                `,
                icon: 'info',
                confirmButtonText: 'เข้าใจแล้ว',
                confirmButtonColor: '#166534'
            });
        } else {
            swal.fire({
                title: 'ติดตั้งแอป Home Matcha Cafe',
                html: `
                    <div style="text-align: left; font-size: 0.92rem; line-height: 1.6; color: #334155;">
                        <p>สามารถกดเมนู <strong>(⋮) หรือ ไอคอนติดตั้ง</strong> ที่แถบ URL ของเบราว์เซอร์ (Chrome / Edge) แล้วเลือก <strong>"ติดตั้งแอป (Install App)"</strong> เพื่อใช้งานได้เลยค่ะ</p>
                    </div>
                `,
                icon: 'info',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#166534'
            });
        }
    }

    onMount(() => {
        loadCartFromStorage();
        loadMemberFromStorage();
        checkAdminPendingReviews();

        // 📲 ลงทะเบียน Service Worker สำหรับ PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch((err) => {
                console.warn('PWA Service Worker registration:', err);
            });
        }

        // 🔍 ตรวจสอบเบราว์เซอร์และแพลตฟอร์ม
        const ua = navigator.userAgent || '';
        isLineBrowser = /Line\//i.test(ua);
        isIosDevice = /iPhone|iPad|iPod/i.test(ua);
        isStandalone = window.matchMedia('(display-mode: standalone)').matches || ((window.navigator as any).standalone === true);

        // หากเปิดใน LINE และยังไม่ได้กดปิดแถบแจ้งเตือน ให้แสดงแถบแนะนำเปิดเบราว์เซอร์นอก
        if (isLineBrowser && !sessionStorage.getItem('hmc_line_dismissed')) {
            showLineBanner = true;
        }

        // หากเป็น iOS และยังไม่ได้เปิดเป็น Standalone PWA และยังไม่ได้ปิดแบนเนอร์
        if (isIosDevice && !isStandalone && !isLineBrowser && !sessionStorage.getItem('hmc_install_dismissed')) {
            showInstallBanner = true;
        }

        // ดักจับ Event สำหรับปุ่มติดตั้งแอปบน Chrome/Android
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            if (!sessionStorage.getItem('hmc_install_dismissed') && !isStandalone) {
                showInstallBanner = true;
            }
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        const handleStorageChange = () => {
            loadCartFromStorage();
        };
        const handleOrdersUpdated = () => {
            checkAdminPendingReviews();
            refreshCurrentMemberFromServer();
        };
        const handleLoyaltySettingsUpdated = () => {
            loadMemberFromStorage();
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('cart-updated', handleStorageChange);
        window.addEventListener('orders-updated', handleOrdersUpdated);
        window.addEventListener('loyalty-settings-updated', handleLoyaltySettingsUpdated);
        const pollTimer = setInterval(() => {
            checkAdminPendingReviews();
            if (currentMember) refreshCurrentMemberFromServer();
        }, 15000);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('cart-updated', handleStorageChange);
            window.removeEventListener('orders-updated', handleOrdersUpdated);
            window.removeEventListener('loyalty-settings-updated', handleLoyaltySettingsUpdated);
            clearInterval(pollTimer);
        };
    });

    function toggleModal(e: Event) {
        e.stopPropagation();
        isModalOpen = !isModalOpen;
    }

    function closeModal() {
        isModalOpen = false;
    }

    let { children } = $props();
</script>

<svelte:window onclick={closeModal} />

<!-- 💡 แถบแจ้งเตือนเมื่อเปิดใน LINE เพื่อแนะนำเปิดเบราว์เซอร์จริง -->
{#if isLineBrowser && showLineBanner}
    <div class="line-browser-banner">
        <div class="line-banner-content">
            <span class="line-banner-icon">💡</span>
            <div class="line-banner-text">
                <strong>เปิดในแอป LINE อาจบันทึกรูป QR Code หรือติดตั้งแอปไม่ได้</strong>
                <span>แนะนำกดปุ่มเพื่อเปิดผ่าน Chrome หรือ Safari เพื่อประสบการณ์ใช้งานที่ดีที่สุด</span>
            </div>
        </div>
        <div class="line-banner-actions">
            <button class="line-banner-btn" onclick={openExternalBrowserFromLine}>
                🌐 เปิดในเบราว์เซอร์
            </button>
            <button class="line-banner-close" onclick={() => { showLineBanner = false; sessionStorage.setItem('hmc_line_dismissed', '1'); }} aria-label="ปิดการแจ้งเตือน">
                ✕
            </button>
        </div>
    </div>
{/if}

<!-- 📲 แถบแนะนำการติดตั้ง PWA App -->
{#if showInstallBanner && !isStandalone && !isLineBrowser}
    <div class="pwa-install-banner">
        <div class="pwa-banner-content">
            <img src="/image/home-matcha-cafe-logo.png" alt="App Icon" class="pwa-banner-icon" />
            <div class="pwa-banner-text">
                <strong>ติดตั้งแอป Home Matcha Cafe</strong>
                <span>แตะติดตั้งเพื่อใช้งานได้เสมือนแอปจริงบนมือถือ สะดวก รวดเร็ว ไม่ต้องค้นหาลิงก์</span>
            </div>
        </div>
        <div class="pwa-banner-actions">
            <button class="pwa-install-btn" onclick={handleInstallPwa}>
                📲 ติดตั้งแอป
            </button>
            <button class="pwa-banner-close" onclick={() => { showInstallBanner = false; sessionStorage.setItem('hmc_install_dismissed', '1'); }} aria-label="ปิดการแจ้งเตือน">
                ✕
            </button>
        </div>
    </div>
{/if}

<!-- แถบนำทางด้านบนแบบ Floating Frosted Glass -->
<div class="nav-bar-wrapper">
    <nav class="nav-bar">
        <div class="nav-left">
            <button class="logo-btn" onclick={() => goto('/')} aria-label="กลับหน้าแรก">
                <div class="logo-img-box">
                    <img class="logo-img protect-img" src="/image/home-matcha-cafe-logo.png" alt="Home Matcha Logo" />
                </div>
                <div class="cafe-brand">
                    <p class="cafe-brand-title">Home Matcha Cafe</p>
                    <p class="cafe-brand-sub">@ Thong Pha Phum Hospital</p>
                </div>
            </button>
        </div>

        <div class="nav-links">
            <a href="/" class="nav-link {page.url.pathname === '/' ? 'active' : ''}">หน้าแรก</a>
            <a href="/menu" class="nav-link {page.url.pathname.startsWith('/menu') || page.url.pathname.startsWith('/order') ? 'active' : ''}">เมนูเครื่องดื่ม</a>
            {#if loyaltySettings.enabled !== false}
                <a href="/loyalty" class="nav-link {page.url.pathname === '/loyalty' ? 'active' : ''}">บัตรสะสมแต้ม</a>
            {/if}
            <a href="/success" class="nav-link {page.url.pathname === '/success' ? 'active' : ''}">ประวัติคำสั่งซื้อ</a>
            <a href="/admin" class="nav-link {page.url.pathname === '/admin' ? 'active' : ''}" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                <span>Admin</span>
                {#if adminPendingReviewCount > 0}
                    <span style="background: #d97706; color: #ffffff; font-size: 0.7rem; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 999px; line-height: 1.2;">
                        🔔 {adminPendingReviewCount}
                    </span>
                {/if}
            </a>
            {#if !isStandalone && !isLineBrowser}
                <button type="button" class="nav-install-chip" onclick={handleInstallPwa} title="ติดตั้งแอปพลิเคชัน">
                    📲 ติดตั้งแอป
                </button>
            {/if}
        </div>

        <div class="nav-actions">
            <!-- ปุ่มตะกร้าสินค้า -->
            <button onclick={toggleModal} class="nav-cart-btn" aria-label="เปิดตะกร้าสินค้า">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
                <span>ตะกร้า</span>
                <span class="cart-count-pill">{totalCount}</span>
            </button>

            <!-- กล่อง Dropdown ตะกร้าสินค้า -->
            {#if isModalOpen}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="cart-modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
                    <div class="cart-modal-header">
                        <h3 class="cart-modal-title">ตะกร้าสินค้าของคุณ</h3>
                        <span class="cart-modal-count">{totalCount} แก้ว</span>
                    </div>

                    <div class="cart-modal-body">
                        {#if basketItems.length === 0}
                            <div class="cart-modal-empty">
                                <p style="font-size: 2rem; margin: 0 0 0.5rem 0;">🍵</p>
                                <p style="margin: 0; font-weight: 500;">ยังไม่มีสินค้าในตะกร้า</p>
                                <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">เลือกเมนูมัทฉะที่คุณชื่นชอบได้เลย</p>
                            </div>
                        {:else}
                            <ul class="cart-modal-list">
                                {#each basketItems as item, idx}
                                    <li class="cart-modal-item">
                                        <div style="flex-grow: 1;">
                                            <p class="cart-item-title">{item.thaiName || item.name}</p>
                                            <p class="cart-item-sub">
                                                {item.price} ฿ · หวาน {item.sweetness ?? 50}%
                                                {#if item.addonName}
                                                    · <span style="color: #166534; font-weight: 700;">+{item.addonName} (+{item.addonPrice || 0}฿)</span>
                                                {/if}
                                                {#if item.note} · <span style="color: var(--matcha-primary); font-size: 0.75rem;">({item.note})</span>{/if}
                                            </p>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.35rem;">
                                            <button 
                                                onclick={() => cartContext.updateQtyByIndex(idx, -1)}
                                                style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border-light); background: #fff; cursor: pointer; font-weight: bold;"
                                                title="ลดจำนวน"
                                            >-</button>
                                            <span style="font-weight: 700; font-size: 0.85rem; min-width: 16px; text-align: center;">{item.quantity}</span>
                                            <button 
                                                onclick={() => cartContext.updateQtyByIndex(idx, 1)}
                                                style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border-light); background: #fff; cursor: pointer; font-weight: bold;"
                                                title="เพิ่มจำนวน"
                                            >+</button>
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    {#if basketItems.length > 0}
                        <div class="cart-modal-footer">
                            <div class="cart-total-row">
                                <span>ยอดรวมทั้งหมด</span>
                                <span style="font-size: 1.1rem; color: var(--matcha-dark);">{totalPrice} บาท</span>
                            </div>
                            <button 
                                onclick={() => { isModalOpen = false; goto('/location'); }} 
                                class="btn-matcha-primary" 
                                style="width: 100%; padding: 0.65rem;"
                            >
                                ดำเนินการสั่งซื้อ ({totalPrice}.-)
                            </button>
                        </div>
                    {:else}
                        <div class="cart-modal-footer">
                            <button 
                                onclick={() => { isModalOpen = false; goto('/menu'); }} 
                                class="btn-matcha-outline" 
                                style="width: 100%; padding: 0.65rem;"
                            >
                                ไปเลือกดูเมนู
                            </button>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </nav>
</div>

<!-- ส่วนเนื้อหาของหน้าเว็บ -->
{@render children()}

<!-- ปุ่มวงกลมลอยมุมขวาล่างสำหรับระบบสมาชิก & สะสมแต้ม (เลื่อนขึ้นอัตโนมัติในหน้าเมนูที่มีแถบตะกร้าด้านล่าง) -->
{#if !page.url.pathname.startsWith('/admin') && loyaltySettings.enabled !== false}
    <button
        type="button"
        class="floating-member-fab {shouldElevateFloatingBtn ? 'elevated-above-cart' : ''} {currentMember ? 'is-logged-in' : 'is-guest'}"
        onclick={handleFloatingMemberClick}
        aria-label="ระบบสมาชิกและสะสมแต้ม"
    >
        {#if currentMember}
            <div class="fab-stamp-badge">
                {currentMember.points}/{loyaltySettings.stampsRequired}
            </div>
            <span class="fab-icon">🍵</span>
            <span class="fab-label">{currentMember.firstName.slice(0, 8)}</span>
        {:else}
            <span class="fab-icon">👤</span>
            <span class="fab-label">Guest</span>
        {/if}
    </button>
{/if}

<!-- Modal เมนูด่วนสำหรับสมาชิกที่ล็อกอินแล้ว -->
{#if showMemberQuickModal && currentMember}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="member-modal-backdrop" onclick={() => (showMemberQuickModal = false)} onkeydown={() => {}}>
        <div class="member-modal-card" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
            <button class="member-modal-close" onclick={() => (showMemberQuickModal = false)} aria-label="ปิด">✕</button>

            <div style="text-align: center; margin-bottom: 1rem;">
                <div style="width: 58px; height: 58px; border-radius: 50%; background: linear-gradient(135deg, #2d5a27, #5c9447); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; margin: 0 auto 0.6rem auto; box-shadow: 0 6px 16px rgba(45, 90, 39, 0.25);">
                    🍵
                </div>
                <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--matcha-deep);">
                    คุณ {currentMember.fullName}
                </h3>
                <p style="margin: 0.15rem 0 0 0; font-size: 0.82rem; color: var(--text-muted);">
                    📱 {currentMember.phone}
                </p>
            </div>

            <div style="background: linear-gradient(135deg, #f3f9ee, #e6f3dc); border: 1.5px solid #b8dba0; border-radius: 14px; padding: 0.9rem; text-align: center; margin-bottom: 1rem;">
                <p style="margin: 0; font-size: 0.78rem; color: #3d6329; font-weight: 700;">แต้มสะสมปัจจุบัน</p>
                <p style="margin: 0.2rem 0; font-size: 1.75rem; font-weight: 900; color: #1e4214;">
                    {currentMember.points} <span style="font-size: 1rem; font-weight: 700; color: #4d7a36;">/ {loyaltySettings.stampsRequired} ดวง</span>
                </p>
                {#if currentMember.points >= loyaltySettings.stampsRequired}
                    <span style="display: inline-block; background: #16a34a; color: #fff; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.65rem; border-radius: 999px;">
                        🎁 แลกฟรีได้ {Math.floor(currentMember.points / loyaltySettings.stampsRequired)} แก้ว!
                    </span>
                {:else if currentMember.cardExpiresAt}
                    <p style="margin: 0.15rem 0 0 0; font-size: 0.72rem; color: #527043;">
                        หมดอายุบัตร: {new Date(currentMember.cardExpiresAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                {:else}
                    <p style="margin: 0.15rem 0 0 0; font-size: 0.72rem; color: #527043;">
                        บัตรมีอายุ {loyaltySettings.expireDays} วัน นับตั้งแต่ซื้อแก้วแรก
                    </p>
                {/if}
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                <button
                    type="button"
                    class="btn-matcha-primary"
                    style="width: 100%; padding: 0.8rem;"
                    onclick={() => {
                        showMemberQuickModal = false;
                        goto('/loyalty');
                    }}
                >
                    🎫 เปิดดูบัตรสะสมแต้ม ({currentMember.points}/{loyaltySettings.stampsRequired})
                </button>

                <button
                    type="button"
                    class="btn-danger"
                    style="width: 100%; padding: 0.7rem;"
                    onclick={handleMemberLogout}
                >
                    🚪 ออกจากระบบ (Logout)
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Modal สมัครสมาชิก / เข้าสู่ระบบ + หน้าปุ่มกด PIN Numpad -->
{#if showMemberAuthModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="member-modal-backdrop" onclick={closeAuthModal} onkeydown={() => {}}>
        <div class="member-modal-card" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
            <button class="member-modal-close" onclick={closeAuthModal} aria-label="ปิด">✕</button>

            {#if authStep === 'form'}
                <div style="text-align: center; margin-bottom: 1rem;">
                    <span style="font-size: 2rem;">🍵</span>
                    <h3 style="margin: 0.25rem 0 0.15rem 0; font-size: 1.2rem; font-weight: 800; color: var(--matcha-deep);">
                        สมาชิก Home Matcha Cafe
                    </h3>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">
                        สะสมครบ {loyaltySettings.stampsRequired} แก้ว รับฟรีทันที 1 แก้ว!
                    </p>
                </div>

                <!-- แท็บสลับ เข้าสู่ระบบ / สมัครสมาชิก -->
                <div class="auth-tab-bar">
                    <button
                        type="button"
                        class="auth-tab-btn {authMode === 'login' ? 'active' : ''}"
                        onclick={() => { authMode = 'login'; authError = ''; }}
                    >
                        เข้าสู่ระบบ
                    </button>
                    <button
                        type="button"
                        class="auth-tab-btn {authMode === 'register' ? 'active' : ''}"
                        onclick={() => { authMode = 'register'; authError = ''; }}
                    >
                        สมัครสมาชิกใหม่
                    </button>
                </div>

                {#if authError}
                    <div class="auth-error-box">{authError}</div>
                {/if}

                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        handleProceedToPinStep();
                    }}
                    style="display: flex; flex-direction: column; gap: 0.75rem;"
                >
                    {#if authMode === 'register'}
                        <div class="reg-name-grid">
                            <div class="reg-field-col">
                                <label for="reg-fname" class="matcha-input-label">ชื่อจริง *</label>
                                <input
                                    id="reg-fname"
                                    type="text"
                                    class="matcha-input"
                                    placeholder="กรอกชื่อจริง"
                                    bind:value={authFirstName}
                                    required
                                />
                            </div>
                            <div class="reg-field-col">
                                <label for="reg-lname" class="matcha-input-label">นามสกุล *</label>
                                <input
                                    id="reg-lname"
                                    type="text"
                                    class="matcha-input"
                                    placeholder="กรอกนามสกุล"
                                    bind:value={authLastName}
                                    required
                                />
                            </div>
                        </div>
                    {/if}

                    <div class="reg-field-col">
                        <label for="auth-phone" class="matcha-input-label">เบอร์โทรศัพท์ *</label>
                        <input
                            id="auth-phone"
                            type="tel"
                            inputmode="numeric"
                            maxlength="10"
                            class="matcha-input"
                            placeholder="กรอกเบอร์โทรศัพท์ 10 หลัก"
                            bind:value={authPhone}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isAuthSubmitting}
                        class="btn-matcha-primary"
                        style="width: 100%; padding: 0.85rem; margin-top: 0.25rem;"
                    >
                        {isAuthSubmitting ? 'กำลังตรวจสอบ...' : 'ยืนยันเพื่อกรอกรหัส PIN ➔'}
                    </button>
                </form>
            {:else}
                <!-- หน้า UI PIN Numpad -->
                <div style="text-align: center;">
                    <button
                        type="button"
                        onclick={() => { authStep = 'form'; authPin = ''; authError = ''; }}
                        style="background: none; border: none; color: var(--matcha-primary); font-size: 0.8rem; font-weight: 700; cursor: pointer; margin-bottom: 0.4rem;"
                    >
                        ← ย้อนกลับ ({authPhone})
                    </button>

                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--matcha-deep);">
                        {authMode === 'register' ? '🔐 ตั้งรหัส PIN 4 หลัก' : '🔐 กรอกรหัส PIN 4 หลัก'}
                    </h3>
                    <p style="margin: 0.2rem 0 0.9rem 0; font-size: 0.8rem; color: var(--text-muted);">
                        {authMode === 'register'
                            ? `สำหรับบัญชีคุณ ${authFirstName} (${authPhone})`
                            : `เข้าสู่ระบบเบอร์ ${authPhone}`}
                    </p>

                    <!-- จุดแสดงรหัส PIN 4 หลัก -->
                    <div class="pin-dots-row">
                        {#each [0, 1, 2, 3] as idx}
                            <div class="pin-dot {authPin.length > idx ? 'filled' : ''}">
                                {#if authPin.length > idx}🍵{/if}
                            </div>
                        {/each}
                    </div>

                    {#if authError}
                        <div class="auth-error-box" style="margin-bottom: 0.75rem;">{authError}</div>
                    {/if}

                    <!-- ปุ่มกด Numpad 3x4 -->
                    <div class="pin-numpad-grid">
                        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
                            <button
                                type="button"
                                class="pin-numpad-btn"
                                disabled={isAuthSubmitting}
                                onclick={() => handlePinDigit(digit)}
                            >
                                {digit}
                            </button>
                        {/each}
                        <button
                            type="button"
                            class="pin-numpad-btn action-btn"
                            disabled={isAuthSubmitting}
                            onclick={handlePinClear}
                        >
                            ล้าง
                        </button>
                        <button
                            type="button"
                            class="pin-numpad-btn"
                            disabled={isAuthSubmitting}
                            onclick={() => handlePinDigit('0')}
                        >
                            0
                        </button>
                        <button
                            type="button"
                            class="pin-numpad-btn action-btn"
                            disabled={isAuthSubmitting}
                            onclick={handlePinBackspace}
                        >
                            ⌫
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .floating-member-fab {
        position: fixed;
        right: 1.15rem;
        bottom: 1.25rem;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 2.5px solid #ffffff;
        background: linear-gradient(135deg, #2d5a27, #4e843b);
        color: #ffffff;
        box-shadow: 0 8px 24px rgba(32, 62, 24, 0.35);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.05rem;
        cursor: pointer;
        z-index: 95;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), bottom 0.25s ease, box-shadow 0.2s ease;
        padding: 0;
    }

    .floating-member-fab:hover {
        transform: scale(1.07) translateY(-2px);
        box-shadow: 0 12px 28px rgba(32, 62, 24, 0.45);
    }

    .floating-member-fab.elevated-above-cart {
        bottom: 7rem;
    }

    .floating-member-fab .fab-icon {
        font-size: 1.25rem;
        line-height: 1;
    }

    .floating-member-fab .fab-label {
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.01em;
        max-width: 54px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .fab-stamp-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        background: #eab308;
        color: #1f2937;
        font-size: 0.65rem;
        font-weight: 900;
        padding: 0.1rem 0.38rem;
        border-radius: 999px;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }

    .member-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 28, 12, 0.62);
        backdrop-filter: blur(6px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        box-sizing: border-box;
    }

    .member-modal-card {
        position: relative;
        width: 100%;
        max-width: 390px;
        background: #ffffff;
        border-radius: 22px;
        padding: 1.5rem 1.35rem;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
        border: 1px solid #d7e8ce;
        box-sizing: border-box;
        overflow: hidden;
    }

    .reg-name-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 0.65rem;
        width: 100%;
    }

    .reg-field-col {
        min-width: 0;
        width: 100%;
    }

    .matcha-input-label {
        display: block;
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--matcha-deep);
        margin-bottom: 0.3rem;
        text-align: left;
    }

    .matcha-input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 0.72rem 0.85rem;
        border-radius: 12px;
        border: 1.5px solid #cfe0c5;
        background: #f9fcf7;
        font-family: inherit;
        font-size: 0.94rem;
        color: #1c3115;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }

    .matcha-input::placeholder {
        color: #94a390;
        font-size: 0.85rem;
    }

    .matcha-input:focus {
        outline: none;
        background: #ffffff;
        border-color: var(--matcha-primary);
        box-shadow: 0 0 0 3px rgba(69, 111, 47, 0.16);
    }

    .member-modal-close {
        position: absolute;
        top: 0.85rem;
        right: 0.95rem;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: #f3f6f1;
        color: #4b5563;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
    }

    .auth-tab-bar {
        display: grid;
        grid-template-columns: 1fr 1fr;
        background: #f1f6ee;
        padding: 0.25rem;
        border-radius: 12px;
        margin-bottom: 1rem;
    }

    .auth-tab-btn {
        border: none;
        background: transparent;
        padding: 0.55rem;
        border-radius: 9px;
        font-size: 0.84rem;
        font-weight: 700;
        color: #5c7055;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .auth-tab-btn.active {
        background: #ffffff;
        color: var(--matcha-deep);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .auth-error-box {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.55rem 0.75rem;
        border-radius: 10px;
        margin-bottom: 0.75rem;
        text-align: center;
    }

    .pin-dots-row {
        display: flex;
        justify-content: center;
        gap: 0.85rem;
        margin-bottom: 1.15rem;
    }

    .pin-dot {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 2px solid #cbd5c5;
        background: #f8fbf6;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        transition: all 0.15s ease;
    }

    .pin-dot.filled {
        border-color: #3f6a2b;
        background: #eaf5e3;
        transform: scale(1.06);
        box-shadow: 0 4px 10px rgba(63, 106, 43, 0.2);
    }

    .pin-numpad-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.65rem;
        max-width: 280px;
        margin: 0 auto;
    }

    .pin-numpad-btn {
        height: 56px;
        border-radius: 16px;
        border: 1.5px solid #dce8d5;
        background: #f9fcf7;
        color: #1f3518;
        font-size: 1.3rem;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.12s ease;
        box-shadow: 0 2px 6px rgba(45, 75, 35, 0.06);
    }

    .pin-numpad-btn:active {
        transform: scale(0.94);
        background: #dfeed6;
    }

    .pin-numpad-btn.action-btn {
        font-size: 0.92rem;
        background: #f1f5ef;
        color: #4b6043;
    }

    @media (max-width: 768px) {
        .floating-member-fab {
            width: 58px;
            height: 58px;
            right: 0.95rem;
            bottom: 1.15rem;
        }
        .floating-member-fab.elevated-above-cart {
            bottom: 6.75rem;
        }
        .member-modal-card {
            padding: 1.35rem 1.1rem;
            border-radius: 20px;
        }
    }

    @media (max-width: 360px) {
        .reg-name-grid {
            grid-template-columns: 1fr;
        }
    }

    /* 🌐 LINE & PWA Install Banners */
    .line-browser-banner {
        position: sticky;
        top: 0;
        z-index: 1000;
        background: linear-gradient(90deg, #fef3c7, #fef9c3);
        border-bottom: 1.5px solid #fde047;
        color: #78350f;
        padding: 0.65rem 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        font-family: 'Kanit', sans-serif;
    }
    .line-banner-content {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        font-size: 0.85rem;
        line-height: 1.35;
    }
    .line-banner-icon {
        font-size: 1.3rem;
        flex-shrink: 0;
    }
    .line-banner-text {
        display: flex;
        flex-direction: column;
    }
    .line-banner-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }
    .line-banner-btn {
        background: #06c755;
        color: #ffffff;
        border: none;
        border-radius: 999px;
        padding: 0.35rem 0.85rem;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        box-shadow: 0 2px 6px rgba(6, 199, 85, 0.25);
        transition: all 0.15s ease;
    }
    .line-banner-btn:active {
        transform: scale(0.96);
    }
    .line-banner-close, .pwa-banner-close {
        background: transparent;
        border: none;
        color: #64748b;
        font-size: 1.1rem;
        font-weight: 800;
        cursor: pointer;
        padding: 0.2rem 0.4rem;
        line-height: 1;
        border-radius: 50%;
    }

    .pwa-install-banner {
        position: sticky;
        top: 0;
        z-index: 999;
        background: linear-gradient(90deg, #f0fdf4, #e8f5e9);
        border-bottom: 1.5px solid #86efac;
        color: #14532d;
        padding: 0.65rem 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        font-family: 'Kanit', sans-serif;
    }
    .pwa-banner-content {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        font-size: 0.85rem;
        line-height: 1.35;
    }
    .pwa-banner-icon {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        object-fit: cover;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
        flex-shrink: 0;
    }
    .pwa-banner-text {
        display: flex;
        flex-direction: column;
    }
    .pwa-banner-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }
    .pwa-install-btn {
        background: #166534;
        color: #ffffff;
        border: none;
        border-radius: 999px;
        padding: 0.35rem 0.85rem;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        box-shadow: 0 2px 6px rgba(22, 101, 52, 0.25);
        transition: all 0.15s ease;
    }
    .pwa-install-btn:active {
        transform: scale(0.96);
    }
    .nav-install-chip {
        background: rgba(22, 101, 52, 0.1);
        color: #166534;
        border: 1.5px solid #86efac;
        border-radius: 999px;
        padding: 0.25rem 0.7rem;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        transition: all 0.15s ease;
    }
    .nav-install-chip:hover {
        background: #166534;
        color: #ffffff;
    }

    @media (max-width: 640px) {
        .line-browser-banner, .pwa-install-banner {
            flex-direction: column;
            align-items: stretch;
            padding: 0.6rem 0.85rem;
            gap: 0.5rem;
        }
        .line-banner-actions, .pwa-banner-actions {
            justify-content: flex-end;
        }
    }
</style>