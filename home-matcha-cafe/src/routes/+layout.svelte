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
        createdAt?: string;
        updatedAt?: string;
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
    let memberQuickTab = $state<'overview' | 'profile'>('overview');
    let editFirstName = $state('');
    let editLastName = $state('');
    let isSavingProfile = $state(false);
    let profileSaveMsg = $state<{ type: 'success' | 'error'; text: string } | null>(null);

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
        openQuickModal: (tab: 'overview' | 'profile' = 'overview') => {
            if (currentMember) {
                editFirstName = currentMember.firstName || '';
                editLastName = currentMember.lastName || '';
                memberQuickTab = tab;
                profileSaveMsg = null;
                showMemberQuickModal = true;
            } else {
                authMode = 'login';
                authStep = 'form';
                authPin = '';
                authError = '';
                showMemberAuthModal = true;
            }
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
            editFirstName = currentMember.firstName || '';
            editLastName = currentMember.lastName || '';
            memberQuickTab = 'overview';
            profileSaveMsg = null;
            showMemberQuickModal = true;
        } else {
            authMode = 'login';
            authStep = 'form';
            authPin = '';
            authError = '';
            showMemberAuthModal = true;
        }
    }

    async function handleSaveProfile() {
        if (!currentMember) return;
        const cleanFirst = editFirstName.trim();
        const cleanLast = editLastName.trim();
        if (!cleanFirst || !cleanLast) {
            profileSaveMsg = { type: 'error', text: 'กรุณากรอกชื่อและนามสกุลให้ครบถ้วนค่ะ' };
            return;
        }
        isSavingProfile = true;
        profileSaveMsg = null;
        try {
            const res = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-profile',
                    phone: currentMember.phone,
                    firstName: cleanFirst,
                    lastName: cleanLast
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                profileSaveMsg = { type: 'error', text: data.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่' };
                return;
            }

            currentMember = data.member;
            localStorage.setItem('hmc_member', JSON.stringify(data.member));
            profileSaveMsg = { type: 'success', text: 'บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้วค่ะ ✨' };
            swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'อัปเดตชื่อสำเร็จแล้ว 🍵',
                showConfirmButton: false,
                timer: 2000
            });
        } catch {
            profileSaveMsg = { type: 'error', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์' };
        } finally {
            isSavingProfile = false;
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

    // 📲 PWA & In-App Browser Detection & Installation
    const PWA_PROMPT_KEY = 'hmc_pwa_prompt_shown_v1';
    let isLineBrowser = $state(false);
    let deferredInstallPrompt = $state<any>(null);
    let showInstallBanner = $state(false);
    let showInstallModal = $state(false);
    let activeInstallTab = $state<'android' | 'ios'>('android');
    let isIosDevice = $state(false);
    let isStandalone = $state(false);

    function dismissInstallPrompt() {
        showInstallBanner = false;
        try {
            localStorage.setItem(PWA_PROMPT_KEY, 'true');
        } catch {}
    }

    function openInstallModal() {
        if (isIosDevice) {
            activeInstallTab = 'ios';
        } else {
            activeInstallTab = 'android';
        }
        showInstallModal = true;
    }

    async function handleInstallPwa() {
        try {
            localStorage.setItem(PWA_PROMPT_KEY, 'true');
        } catch {}
        showInstallBanner = false;

        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('User accepted PWA installation');
                showInstallModal = false;
            }
            deferredInstallPrompt = null;
        } else {
            openInstallModal();
        }
    }

    onMount(() => {
        loadCartFromStorage();
        loadMemberFromStorage();
        checkAdminPendingReviews();

        // 📱 ตรวจสอบการเปิดจาก LINE ด้วย query param ?action=register หรือ ?phone=...
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const phoneParam = urlParams.get('phone');
            const actionParam = urlParams.get('action');

            if (phoneParam) {
                const cleanPhone = phoneParam.replace(/\D/g, '').slice(0, 10);
                if (cleanPhone.length >= 9) {
                    authPhone = cleanPhone;
                    // หากมี action=register หรือลูกค้ายังไม่ได้ล็อกอิน ให้เปิดหน้าต่างสมัครสมาชิกและกรอกเบอร์ให้อัตโนมัติทันที
                    if (actionParam === 'register' || (!currentMember && !localStorage.getItem('hmc_member'))) {
                        authMode = 'register';
                        authStep = 'form';
                        authError = '';
                        showMemberAuthModal = true;
                    }
                }
            } else if (actionParam === 'register') {
                authMode = 'register';
                authStep = 'form';
                authError = '';
                showMemberAuthModal = true;
            }
        } catch (e) {
            console.warn('Error reading URL params for member auth:', e);
        }

        // 📲 ลงทะเบียน Service Worker สำหรับ PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
                console.warn('PWA Service Worker registration:', err);
            });
        }

        // 🔍 ตรวจสอบและเด้งเปิดเบราว์เซอร์จริงภายนอก (External Browser) อัตโนมัติทันที ไร้ UI กวนใจ
        const ua = navigator.userAgent || '';
        const isLine = /Line\//i.test(ua);
        isLineBrowser = isLine;
        const isAndroid = /Android/i.test(ua);
        const isOtherInApp = /Instagram|FBAN|FBAV|FB_IAB|Messenger|musical_ly|ByteLocale|BytedanceWebview|TikTok|Twitter|Snapchat/i.test(ua);
        isIosDevice = /iPhone|iPad|iPod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        isStandalone = window.matchMedia('(display-mode: standalone)').matches || ((window.navigator as any).standalone === true);

        // 1. ถ้าเปิดใน LINE (ทั้ง iOS และ Android): เด้งเปิดเบราว์เซอร์หลักทันที (iOS -> Safari, Android -> Chrome/Default)
        if (isLine && typeof window !== 'undefined') {
            try {
                const currentUrl = new URL(window.location.href);
                if (!currentUrl.searchParams.has('openExternalBrowser') && !sessionStorage.getItem('hmc_line_bounced')) {
                    sessionStorage.setItem('hmc_line_bounced', '1');
                    currentUrl.searchParams.set('openExternalBrowser', '1');
                    window.location.replace(currentUrl.toString());
                    return;
                }
            } catch (err) {
                console.warn('Auto redirect from LINE:', err);
            }
        }

        // 2. ถ้าเปิดใน IG / FB / TikTok / อื่นๆ บน Android: ใช้ Intent เปิด Chrome / เบราว์เซอร์เริ่มต้นทันที
        if (isAndroid && isOtherInApp && typeof window !== 'undefined') {
            try {
                if (!sessionStorage.getItem('hmc_inapp_intent_tried')) {
                    sessionStorage.setItem('hmc_inapp_intent_tried', '1');
                    const cleanUrl = window.location.href.replace(/^https?:\/\//, '');
                    const intentUrl = `intent://${cleanUrl}#Intent;scheme=https;action=android.intent.action.VIEW;end;`;
                    window.location.replace(intentUrl);
                    return;
                }
            } catch (err) {
                console.warn('Auto redirect from In-App browser:', err);
            }
        }

        // 🧪 โหมดทดสอบ: หากมี query param ?testPwa=1 หรือ ?resetPwa=1 ให้ล้างสถานะและบังคับให้แสดงใหม่ได้ตลอดเวลา
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('testPwa') || urlParams.has('resetPwa')) {
            try {
                localStorage.removeItem(PWA_PROMPT_KEY);
            } catch {}
        }

        // ตรวจสอบว่าเคยแสดงป๊อปอัปติดตั้งแอปแล้วหรือยัง (ขึ้นแค่ครั้งเดียวเท่านั้น ถ้าเคยขึ้นแล้วไม่ต้องขึ้นอีก)
        let hasShownPrompt = false;
        try {
            hasShownPrompt = localStorage.getItem(PWA_PROMPT_KEY) === 'true';
        } catch {}

        // หากเป็น iOS และยังไม่เคยแสดงมาก่อน และไม่อยู่ในหน้า Admin
        if (isIosDevice && !isStandalone && !isLine && !isOtherInApp && !hasShownPrompt && !window.location.pathname.startsWith('/admin')) {
            showInstallBanner = true;
            try {
                localStorage.setItem(PWA_PROMPT_KEY, 'true');
            } catch {}
        }

        // ดักจับ Event สำหรับปุ่มติดตั้งแอปบน Chrome/Android (ขึ้นแค่ครั้งเดียวเท่านั้น)
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            if (!hasShownPrompt && !isStandalone && !isLine && !isOtherInApp && !window.location.pathname.startsWith('/admin')) {
                showInstallBanner = true;
                try {
                    localStorage.setItem(PWA_PROMPT_KEY, 'true');
                } catch {}
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

<!-- 📲 การ์ดแนะนำการติดตั้ง PWA App (Floating Bottom Card แสดงเพียงครั้งเดียวเท่านั้น ไม่ทับซ้อน Navbar) -->
{#if showInstallBanner && !isStandalone && !isLineBrowser && !page.url.pathname.startsWith('/admin')}
    <div class="pwa-install-card {shouldElevateFloatingBtn ? 'elevated-above-cart' : ''}">
        <div class="pwa-card-left">
            <img src="/image/home-matcha-cafe-logo.png" alt="Home Matcha Cafe" class="pwa-card-icon" />
            <div class="pwa-card-text">
                <span class="pwa-card-badge">🍵 ติดตั้งแอป Home Matcha Cafe</span>
                <strong class="pwa-card-title">โฮมมัทฉะคาเฟ่ @ รพ.ทองผาภูมิ</strong>
                <span class="pwa-card-desc">เข้าสั่งจากหน้าจอโฮมได้สะดวก รวดเร็ว เสมือนแอปมือถือ</span>
            </div>
        </div>
        <div class="pwa-card-actions">
            <button type="button" class="pwa-card-install-btn" onclick={handleInstallPwa}>
                ติดตั้ง
            </button>
            <button type="button" class="pwa-card-close-btn" onclick={dismissInstallPrompt} aria-label="ปิด">
                ✕
            </button>
        </div>
    </div>
{/if}

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

<!-- Modal เมนูด่วนสำหรับสมาชิกที่ล็อกอินแล้ว (Professional Profile & Loyalty) -->
{#if showMemberQuickModal && currentMember}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="member-modal-backdrop" onclick={() => (showMemberQuickModal = false)} onkeydown={() => {}}>
        <div class="member-modal-card profile-modal-card" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
            <button class="member-modal-close" onclick={() => (showMemberQuickModal = false)} aria-label="ปิด">✕</button>

            <!-- Navigation Tabs -->
            <div class="profile-tabs-header">
                <button
                    type="button"
                    class="profile-tab-btn"
                    class:active={memberQuickTab === 'overview'}
                    onclick={() => { memberQuickTab = 'overview'; profileSaveMsg = null; }}
                >
                    <span>✨</span> บัตรสะสมแต้ม
                </button>
                <button
                    type="button"
                    class="profile-tab-btn"
                    class:active={memberQuickTab === 'profile'}
                    onclick={() => {
                        memberQuickTab = 'profile';
                        editFirstName = currentMember?.firstName || '';
                        editLastName = currentMember?.lastName || '';
                        profileSaveMsg = null;
                    }}
                >
                    <span>👤</span> ข้อมูลโปรไฟล์
                </button>
            </div>

            {#if memberQuickTab === 'overview'}
                <!-- Overview Tab -->
                <div class="tab-content-fade">
                    <div style="text-align: center; margin-bottom: 1rem;">
                        <div class="profile-avatar-circle">
                            {(currentMember.firstName || 'M').charAt(0).toUpperCase()}
                        </div>
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--matcha-deep);">
                            คุณ {currentMember.fullName}
                        </h3>
                        <div class="profile-verified-badge">
                            <span class="badge-dot"></span> 🌿 สมาชิก Home Matcha Cafe
                        </div>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.82rem; color: var(--text-muted);">
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

                    <div style="display: flex; flex-direction: column; gap: 0.55rem;">
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
                            class="btn-profile-edit-toggle"
                            onclick={() => {
                                memberQuickTab = 'profile';
                                editFirstName = currentMember?.firstName || '';
                                editLastName = currentMember?.lastName || '';
                                profileSaveMsg = null;
                            }}
                        >
                            ✏️ ข้อมูลโปรไฟล์ & แก้ไขชื่อ
                        </button>

                        {#if !isStandalone}
                            <button
                                type="button"
                                class="btn-install-member"
                                onclick={() => {
                                    showMemberQuickModal = false;
                                    openInstallModal();
                                }}
                            >
                                📲 ติดตั้งแอป Home Matcha Cafe
                            </button>
                        {/if}

                        <button
                            type="button"
                            class="btn-danger"
                            style="width: 100%; padding: 0.65rem;"
                            onclick={handleMemberLogout}
                        >
                            🚪 ออกจากระบบ (Logout)
                        </button>
                    </div>
                </div>
            {:else}
                <!-- Profile Settings Tab (Professional) -->
                <div class="tab-content-fade">
                    <div class="profile-edit-hero">
                        <div class="profile-avatar-circle small">
                            {(editFirstName || currentMember.firstName || 'M').charAt(0).toUpperCase()}
                        </div>
                        <div class="profile-hero-info">
                            <h4 class="profile-edit-title">โปรไฟล์สมาชิก (Profile)</h4>
                            <p class="profile-edit-sub">จัดการข้อมูลส่วนตัวและชื่อผู้รับสำหรับออเดอร์</p>
                        </div>
                    </div>

                    {#if profileSaveMsg}
                        <div class="profile-alert" class:is-success={profileSaveMsg.type === 'success'} class:is-error={profileSaveMsg.type === 'error'}>
                            <span>{profileSaveMsg.type === 'success' ? '✓' : '⚠️'}</span>
                            <span>{profileSaveMsg.text}</span>
                        </div>
                    {/if}

                    <div class="profile-field-group">
                        <label class="matcha-input-label" for="profile-phone-input">
                            เบอร์โทรศัพท์ (ID บัญชีสมาชิก)
                        </label>
                        <div class="locked-input-wrapper">
                            <span class="locked-icon">🔒</span>
                            <input
                                id="profile-phone-input"
                                type="text"
                                class="matcha-input locked-input"
                                value={currentMember.phone}
                                disabled
                                readonly
                            />
                        </div>
                        <span class="profile-field-hint">
                            * เบอร์โทรใช้เป็นรหัสสมาชิกและเชื่อมโยงแต้มสะสม ไม่สามารถแก้ไขได้
                        </span>
                    </div>

                    <div class="reg-name-grid" style="margin-top: 0.85rem;">
                        <div class="reg-field-col">
                            <label class="matcha-input-label" for="profile-firstname-input">
                                ชื่อจริง <span class="required-star">*</span>
                            </label>
                            <input
                                id="profile-firstname-input"
                                type="text"
                                class="matcha-input"
                                placeholder="เช่น พัชร"
                                bind:value={editFirstName}
                                maxlength={60}
                            />
                        </div>
                        <div class="reg-field-col">
                            <label class="matcha-input-label" for="profile-lastname-input">
                                นามสกุล <span class="required-star">*</span>
                            </label>
                            <input
                                id="profile-lastname-input"
                                type="text"
                                class="matcha-input"
                                placeholder="เช่น นันทวานิช"
                                bind:value={editLastName}
                                maxlength={60}
                            />
                        </div>
                    </div>

                    <!-- Member Meta Info Stats Card -->
                    <div class="profile-stats-card">
                        <div class="profile-stat-item">
                            <span class="stat-label">📅 สมัครเมื่อ</span>
                            <span class="stat-value">
                                {currentMember.createdAt ? new Date(currentMember.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'สมาชิกใหม่'}
                            </span>
                        </div>
                        <div class="profile-stat-divider"></div>
                        <div class="profile-stat-item">
                            <span class="stat-label">🍵 แต้มรวมสะสม</span>
                            <span class="stat-value">{currentMember.totalStampsEarned || currentMember.points} แก้ว</span>
                        </div>
                        <div class="profile-stat-divider"></div>
                        <div class="profile-stat-item">
                            <span class="stat-label">🎁 แลกฟรี</span>
                            <span class="stat-value">{currentMember.totalFreeRedeemed || 0} แก้ว</span>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 0.55rem; margin-top: 1.1rem;">
                        <button
                            type="button"
                            class="btn-matcha-primary"
                            style="width: 100%; padding: 0.85rem;"
                            onclick={handleSaveProfile}
                            disabled={isSavingProfile}
                        >
                            {#if isSavingProfile}
                                ⏳ กำลังบันทึกข้อมูล...
                            {:else}
                                💾 บันทึกการเปลี่ยนแปลง
                            {/if}
                        </button>

                        <button
                            type="button"
                            class="btn-profile-back"
                            onclick={() => { memberQuickTab = 'overview'; profileSaveMsg = null; }}
                        >
                            ⬅️ กลับหน้าบัตรสะสมแต้ม
                        </button>

                        <button
                            type="button"
                            class="btn-danger"
                            style="width: 100%; padding: 0.6rem; margin-top: 0.2rem;"
                            onclick={handleMemberLogout}
                        >
                            🚪 ออกจากระบบ (Logout)
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<!-- 📲 Modal แนะนำการติดตั้งแอป (สวยงาม รองรับมือถือ จัดวรรคตอนอ่านง่าย) -->
{#if showInstallModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="install-modal-backdrop" onclick={() => (showInstallModal = false)} onkeydown={() => {}}>
        <div class="install-modal-card" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
            <button class="install-modal-close" onclick={() => (showInstallModal = false)} aria-label="ปิด">✕</button>

            <!-- หัวข้อและโลโก้ -->
            <div class="install-modal-header">
                <img src="/image/home-matcha-cafe-logo.png" alt="Home Matcha Cafe" class="install-modal-logo" />
                <h3 class="install-modal-title">ติดตั้งแอป Home Matcha Cafe</h3>
                <p class="install-modal-subtitle">เปิดสั่งเครื่องดื่มได้ไว</p>
            </div>

            <!-- แท็บเลือกระบบปฏิบัติการ (ถ้าเป็น iOS / Safari ไม่ต้องแสดงแท็บ Chrome ให้สับสน) -->
            {#if !isIosDevice}
                <div class="install-modal-tabs">
                    <button
                        type="button"
                        class="install-tab-btn {activeInstallTab === 'android' ? 'active' : ''}"
                        onclick={() => (activeInstallTab = 'android')}
                    >
                        Android (Chrome)
                    </button>
                    <button
                        type="button"
                        class="install-tab-btn {activeInstallTab === 'ios' ? 'active' : ''}"
                        onclick={() => (activeInstallTab = 'ios')}
                    >
                        iPhone / iPad (Safari)
                    </button>
                </div>
            {:else}
                <div style="text-align: center; margin-bottom: 1rem;">
                    <span style="display: inline-block; background: #f0fdf4; color: #166534; font-size: 0.82rem; font-weight: 700; padding: 0.35rem 0.9rem; border-radius: 999px; border: 1px solid #bbf7d0;">
                        🍎 วิธีติดตั้งสำหรับ iPhone / iPad (Safari)
                    </span>
                </div>
            {/if}

            <!-- เนื้อหาแท็บ Android -->
            {#if activeInstallTab === 'android'}
                <div class="install-guide-body">
                    {#if deferredInstallPrompt}
                        <button
                            type="button"
                            class="install-direct-action-btn"
                            onclick={() => {
                                showInstallModal = false;
                                handleInstallPwa();
                            }}
                        >
                            📲 กดเพื่อติดตั้งลงหน้าจอโฮมทันที
                        </button>
                        <!-- <div class="install-divider">
                            <span>หรือติดตั้งผ่านเมนูของ Chrome</span>
                        </div> -->
                    {/if}
                    <!-- <div class="install-step-list">
                        <div class="install-step-item">
                            <span class="install-step-num">1</span>
                            <div class="install-step-content">
                                <strong>เปิดผ่าน Google Chrome</strong>
                                <p>แตะปุ่มเมนู <strong style="display: inline;">⋮ "จุดสามจุด"</strong> ที่มุมบนขวาของเบราว์เซอร์</p>
                            </div>
                        </div>

                        <div class="install-step-item">
                            <span class="install-step-num">2</span>
                            <div class="install-step-content">
                                <strong>เลือก "ติดตั้งแอปพลิเคชัน" (Install app)</strong>
                                <p>แตะเมนู <strong style="display: inline;">"ติดตั้งแอปพลิเคชัน"</strong></p>
                            </div>
                        </div>

                        <div class="install-step-item">
                            <span class="install-step-num">3</span>
                            <div class="install-step-content">
                                <strong>กดยืนยันการติดตั้ง</strong>
                                <p>แตะ <strong style="display: inline;">"ติดตั้ง"</strong> <br>ในหน้าต่างยืนยัน รอ 5-10 วินาที ไอคอนแอปจะไปอยู่ที่หน้าจอโฮมทันที</p>
                            </div>
                        </div>
                    </div> -->
                </div>
            {:else}
                <!-- เนื้อหาแท็บ iOS (Safari) -->
                <div class="install-guide-body">
                    <div class="install-step-list">
                        <div class="install-step-item">
                            <span class="install-step-num">1</span>
                            <div class="install-step-content">
                                <strong>เปิดผ่าน Safari บน iPhone</strong>
                                <p>แตะปุ่มแชร์ <strong style="display: inline;"> "Share"</strong> ที่แถบด้านล่างของหน้าจอ</p>
                            </div>
                        </div>

                        <div class="install-step-item">
                            <span class="install-step-num">2</span>
                            <div class="install-step-content">
                                <strong>เลือก "เพิ่มไปยังหน้าจอโฮม"</strong>
                                <p>เลื่อนลงมาด้านล่าง แล้วแตะ <strong>＋ " เพิ่มไปยังหน้าจอโฮม"</strong></p>
                            </div>
                        </div>

                        <div class="install-step-item">
                            <span class="install-step-num">3</span>
                            <div class="install-step-content">
                                <strong>แตะ "เพิ่ม" (Add)</strong>
                                <p>แตะปุ่ม <strong style="display: inline;">"เพิ่ม (Add)"</strong> ที่มุมบนขวาของหน้าจอ</p>
                                <!-- <span class="install-tip-badge">
                                    ✨ บน iOS จะได้ไอคอนร้านเต็มวงกลมคมชัด ไร้ตราเบราว์เซอร์ 100%
                                </span> -->
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <button
                type="button"
                class="install-modal-dismiss-btn"
                onclick={() => (showInstallModal = false)}
            >
                เข้าใจแล้ว / ปิดหน้าต่าง
            </button>
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
                            placeholder={authPhone || "กรอกเบอร์โทรศัพท์ 10 หลัก"}
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

    .member-modal-card.profile-modal-card {
        max-width: 420px;
        padding: 1.35rem 1.3rem 1.45rem;
    }

    .profile-tabs-header {
        display: flex;
        gap: 0.35rem;
        background: #f1f6ed;
        padding: 0.3rem;
        border-radius: 14px;
        margin-bottom: 1.15rem;
        border: 1px solid #dcebd4;
    }

    .profile-tab-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.55rem 0.5rem;
        border-radius: 10px;
        border: none;
        background: transparent;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 700;
        color: #4b6342;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .profile-tab-btn.active {
        background: #ffffff;
        color: var(--matcha-deep);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .tab-content-fade {
        animation: tabFadeIn 0.22s ease-out;
    }

    @keyframes tabFadeIn {
        from {
            opacity: 0;
            transform: translateY(4px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .profile-avatar-circle {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: linear-gradient(135deg, #2d5a27, #5c9447);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6rem;
        font-weight: 900;
        margin: 0 auto 0.65rem auto;
        box-shadow: 0 8px 18px rgba(45, 90, 39, 0.28);
        border: 2px solid #ffffff;
    }

    .profile-avatar-circle.small {
        width: 48px;
        height: 48px;
        font-size: 1.3rem;
        margin: 0;
        flex-shrink: 0;
    }

    .profile-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.35rem;
        background: #ecf8e5;
        color: #27671a;
        font-size: 0.74rem;
        font-weight: 700;
        padding: 0.2rem 0.65rem;
        border-radius: 999px;
        border: 1px solid #bfe3b1;
    }

    .badge-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #22c55e;
        display: inline-block;
    }

    .btn-profile-edit-toggle {
        width: 100%;
        padding: 0.72rem;
        border-radius: 12px;
        border: 1.5px solid #bdd7b1;
        background: #f7faf5;
        color: #2e5522;
        font-family: inherit;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .btn-profile-edit-toggle:hover {
        background: #edf5ea;
        border-color: #9ec58f;
        transform: translateY(-1px);
    }

    .profile-edit-hero {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        background: linear-gradient(135deg, #f4faef, #eaf4e4);
        border: 1.5px solid #c9e2be;
        border-radius: 14px;
        padding: 0.85rem 1rem;
        margin-bottom: 0.95rem;
    }

    .profile-edit-title {
        margin: 0;
        font-size: 0.96rem;
        font-weight: 800;
        color: var(--matcha-deep);
    }

    .profile-edit-sub {
        margin: 0.15rem 0 0 0;
        font-size: 0.75rem;
        color: #4e6b43;
    }

    .locked-input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .locked-icon {
        position: absolute;
        left: 0.75rem;
        font-size: 0.9rem;
        pointer-events: none;
        opacity: 0.65;
    }

    .locked-input {
        padding-left: 2.2rem !important;
        background: #f1f4ee !important;
        color: #5d6d59 !important;
        cursor: not-allowed;
        border-color: #d1ded0 !important;
    }

    .profile-field-hint {
        display: block;
        margin-top: 0.25rem;
        font-size: 0.7rem;
        color: #687964;
    }

    .profile-stats-card {
        margin-top: 1rem;
        background: #fdfefe;
        border: 1px solid #dbe8d6;
        border-radius: 12px;
        padding: 0.65rem 0.8rem;
        display: flex;
        align-items: center;
        justify-content: space-around;
        text-align: center;
    }

    .profile-stat-item {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }

    .profile-stat-divider {
        width: 1px;
        height: 28px;
        background: #e2ede0;
    }

    .stat-label {
        font-size: 0.68rem;
        color: #667e60;
        font-weight: 600;
    }

    .stat-value {
        font-size: 0.82rem;
        color: #1f3718;
        font-weight: 800;
    }

    .profile-alert {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 0.85rem;
        border-radius: 10px;
        font-size: 0.82rem;
        font-weight: 700;
        margin-bottom: 0.85rem;
    }

    .profile-alert.is-success {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
    }

    .profile-alert.is-error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
    }

    .btn-profile-back {
        width: 100%;
        padding: 0.68rem;
        border-radius: 12px;
        border: 1.5px solid #d4dec0;
        background: #ffffff;
        color: #4b6343;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .btn-profile-back:hover {
        background: #f5f8f3;
        color: #27401d;
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

    /* 📲 PWA Floating Bottom Card (แสดงครั้งเดียว ไม่ทับ Navbar และเข้าธีมร้าน) */
    .pwa-install-card {
        position: fixed;
        bottom: 1.5rem;
        left: 1rem;
        right: 1rem;
        max-width: 440px;
        margin: 0 auto;
        z-index: 1050;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1.5px solid #86efac;
        border-radius: 20px;
        padding: 0.85rem 1rem;
        box-shadow: 0 14px 36px rgba(24, 74, 35, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.85rem;
        font-family: 'Kanit', sans-serif;
        animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transition: bottom 0.25s ease;
    }
    .pwa-install-card.elevated-above-cart {
        bottom: 6.8rem;
    }
    .pwa-card-left {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
    }
    .pwa-card-icon {
        width: 46px;
        height: 46px;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 3px 10px rgba(24, 74, 35, 0.22);
        flex-shrink: 0;
    }
    .pwa-card-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .pwa-card-badge {
        font-size: 0.68rem;
        font-weight: 800;
        color: #166534;
        text-transform: uppercase;
        letter-spacing: 0.4px;
    }
    .pwa-card-title {
        font-size: 0.92rem;
        font-weight: 800;
        color: #14532d;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pwa-card-desc {
        font-size: 0.74rem;
        color: #4b6354;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pwa-card-actions {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        flex-shrink: 0;
    }
    .pwa-card-install-btn {
        background: #184a23;
        color: #ffffff;
        border: none;
        border-radius: 999px;
        padding: 0.45rem 0.95rem;
        font-size: 0.84rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(24, 74, 35, 0.3);
        transition: all 0.15s ease;
        white-space: nowrap;
    }
    .pwa-card-install-btn:active {
        transform: scale(0.95);
    }
    .pwa-card-close-btn {
        background: #f1f5f9;
        border: none;
        color: #64748b;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s ease;
    }
    .pwa-card-close-btn:active {
        background: #e2e8f0;
    }
    .nav-install-chip {
        background: rgba(24, 74, 35, 0.1);
        color: #184a23;
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
        background: #184a23;
        color: #ffffff;
    }

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @keyframes fadeInDown {
        from {
            opacity: 0;
            transform: translateY(-15px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @media (max-width: 640px) {
        .pwa-install-card {
            bottom: 1rem;
            left: 0.75rem;
            right: 0.75rem;
            padding: 0.75rem 0.85rem;
        }
    }

    /* 📲 Custom PWA Installation Guide Modal */
    .btn-install-member {
        width: 100%;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        font-size: 0.88rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        background: #f0fdf4;
        color: #166534;
        border: 1.5px solid #86efac;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 2px 6px rgba(22, 101, 52, 0.08);
    }
    .btn-install-member:hover, .btn-install-member:active {
        background: #dcfce7;
        border-color: #4ade80;
        transform: translateY(-1px);
    }

    .install-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        z-index: 2100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        animation: fadeInDown 0.2s ease-out;
    }
    .install-modal-card {
        background: #ffffff;
        border-radius: 24px;
        padding: 1.5rem 1.25rem 1.25rem 1.25rem;
        width: 100%;
        max-width: 440px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 45px rgba(24, 74, 35, 0.25);
        position: relative;
        font-family: 'Kanit', sans-serif;
    }
    .install-modal-close {
        position: absolute;
        top: 0.85rem;
        right: 0.85rem;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: #f1f5f9;
        color: #64748b;
        font-size: 1rem;
        font-weight: 800;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s ease;
    }
    .install-modal-close:hover {
        background: #e2e8f0;
        color: #334155;
    }
    .install-modal-header {
        text-align: center;
        margin-bottom: 1.15rem;
    }
    .install-modal-logo {
        width: 60px;
        height: 60px;
        border-radius: 16px;
        object-fit: cover;
        box-shadow: 0 4px 14px rgba(24, 74, 35, 0.2);
        margin: 0 auto 0.5rem auto;
        display: block;
    }
    .install-modal-title {
        font-size: 1.15rem;
        font-weight: 800;
        color: #14532d;
        margin: 0 0 0.2rem 0;
        line-height: 1.3;
    }
    .install-modal-subtitle {
        font-size: 0.82rem;
        color: #64748b;
        margin: 0;
        line-height: 1.4;
    }
    .install-modal-tabs {
        display: flex;
        gap: 0.4rem;
        background: #f1f5f9;
        padding: 0.3rem;
        border-radius: 14px;
        margin-bottom: 1.15rem;
    }
    .install-tab-btn {
        flex: 1;
        padding: 0.55rem 0.4rem;
        border: none;
        border-radius: 10px;
        font-size: 0.82rem;
        font-weight: 700;
        color: #64748b;
        background: transparent;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
    }
    .install-tab-btn.active {
        background: #ffffff;
        color: #166534;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }
    .install-guide-body {
        margin-bottom: 1.15rem;
    }
    .install-direct-action-btn {
        width: 100%;
        padding: 0.85rem 1rem;
        border-radius: 14px;
        background: #184a23;
        color: #ffffff;
        border: none;
        font-size: 0.92rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(24, 74, 35, 0.35);
        margin-bottom: 0.85rem;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
    }
    .install-direct-action-btn:active {
        transform: scale(0.97);
    }
    .install-divider {
        text-align: center;
        margin: 0.6rem 0 0.85rem 0;
        position: relative;
    }
    .install-divider::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 1px;
        background: #e2e8f0;
    }
    .install-divider span {
        position: relative;
        font-size: 0.72rem;
        color: #94a3b8;
        background: #ffffff;
        padding: 0 0.5rem;
    }
    .install-step-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    .install-step-item {
        display: flex;
        gap: 0.85rem;
        align-items: flex-start;
        padding: 0.8rem 0.95rem;
        border-radius: 16px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
    }
    .install-step-item.highlight {
        background: #f0fdf4;
        border-color: #86efac;
    }
    .install-step-num {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #184a23;
        color: #ffffff;
        font-size: 0.82rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 0.1rem;
    }
    .install-step-content {
        font-size: 0.84rem;
        line-height: 1.5;
        color: #334155;
    }
    .install-step-content strong {
        display: block;
        font-size: 0.9rem;
        color: #0f172a;
        margin-bottom: 0.2rem;
    }
    .install-step-content p {
        margin: 0;
        font-size: 0.82rem;
        color: #475569;
        line-height: 1.45;
    }
    .install-tip-badge {
        display: inline-block;
        margin-top: 0.45rem;
        font-size: 0.75rem;
        color: #166534;
        background: rgba(22, 101, 52, 0.1);
        padding: 0.25rem 0.55rem;
        border-radius: 6px;
        font-weight: 600;
        line-height: 1.35;
    }
    .install-modal-dismiss-btn {
        width: 100%;
        padding: 0.75rem;
        border-radius: 12px;
        background: #f1f5f9;
        color: #475569;
        border: none;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .install-modal-dismiss-btn:hover {
        background: #e2e8f0;
    }
</style>