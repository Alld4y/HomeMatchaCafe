<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import swal from 'sweetalert2';

    interface DayInfo {
        dateStr: string;
        dayNum: number;
        monthNameTh: string;
        dayNameEn: string;
        dayNameTh: string;
        dayColor: string;
        dayBgLight: string;
        isOpen: boolean;
        availableRounds: Array<{ id: string; name: string; timeSlot: string }>;
        canOrderNow: boolean;
        closeReason?: string;
    }

    interface StoreSettingsData {
        isMasterOpen: boolean;
        closedAlertMessage: string;
        deliveryRounds: Array<{ id: string; name: string; timeSlot: string; allowFermented: boolean }>;
        fermentedCutoffTime: string;
    }

    let scheduleDays = $state<DayInfo[]>([]);
    let storeSettings = $state<StoreSettingsData | null>(null);
    let isLoadingSchedule = $state(true);
    let selectedPreviewDate = $state<string>('');
    let storeStatus = $state<'open' | 'closed_today_can_preorder' | 'closed_store' | 'loading' >('loading');
    let storeStatusBadgeText = $state<string>('🟢 เปิดรับออเดอร์ตามปกติ');
    let storeStatusDesc = $state<string>('');
    let isTodayOrderable = $state<boolean>(true);
    let hasAnyOrderableSlot = $state<boolean>(true);

    let activePreviewDay = $derived(
        scheduleDays.find((d) => d.dateStr === selectedPreviewDate) ||
        scheduleDays.find((d) => d.isOpen) ||
        scheduleDays[0] ||
        null
    );

    const highlights = [
        {
            icon: '🍵',
            title: 'มัทฉะแท้ 100%',
            desc: 'ผงมัทฉะเกรดพิธีการคัดสรรจากญี่ปุ่น หอม เข้มข้น กลมกล่อม'
        },
        {
            icon: '🏥',
            title: 'ส่งฟรีใน รพ.ทองผาภูมิ',
            desc: 'บริการส่งตรงถึงตึกผู้ป่วยใน แผนกต่างๆ และบ้านพักแพทย์/พยาบาล'
        },
        {
            icon: '🥥',
            title: 'นมทางเลือกพรีเมียม',
            desc: 'มีนมโอ๊ตบาริสต้า และน้ำมะพร้าวสดแท้ หวานน้อย อร่อยคลีน'
        },
        {
            icon: '⚡',
            title: 'สั่งง่ายผ่าน PromptPay',
            desc: 'สร้าง QR Code สแกนจ่ายพร้อมตรวจสอบสลิปอัตโนมัติ แม่นยำ รวดเร็ว'
        }
    ];

    let signatureDrinks = $state([
        { id: 'cold-fermented-matcha-oat-latte', name: 'มัทฉะลาเต้นมโอ๊ตบ่ม', eng: 'COLD FERMENTED MATCHA OAT LATTE', price: 70, tag: 'Signature' },
        { id: 'matcha-coconut', name: 'มัทฉะมะพร้าว', eng: 'MATCHA COCONUT', price: 60, tag: 'Popular' },
        { id: 'matcha-latte', name: 'มัทฉะลาเต้', eng: 'MATCHA LATTE', price: 55, tag: 'Classic' }
    ]);

    onMount(async () => {
        try {
            const [res, menuRes] = await Promise.all([
                fetch('/api/settings'),
                fetch('/api/menus')
            ]);
            if (menuRes.ok) {
                const menuData = await menuRes.json();
                if (Array.isArray(menuData.items) && menuData.items.length > 0) {
                    const sigs = menuData.items.filter((i: any) => i.isAvailable !== false && (i.isSignature || i.isPromotion));
                    if (sigs.length > 0) {
                        signatureDrinks = sigs.map((i: any) => ({
                            id: i.id,
                            name: i.thaiName,
                            eng: i.englishName,
                            price: i.price,
                            tag: i.isSignature ? 'Signature' : 'Promo'
                        }));
                    }
                }
            }
            if (res.ok) {
                const data = await res.json();
                scheduleDays = data.days || [];
                storeSettings = data.settings || null;
                storeStatus = data.storeStatus || (storeSettings?.isMasterOpen === false ? 'closed_store' : 'open');
                storeStatusBadgeText = data.storeStatusBadgeText || '';
                storeStatusDesc = data.storeStatusDesc || '';
                isTodayOrderable = data.isTodayOrderable ?? true;
                hasAnyOrderableSlot = data.hasAnyOrderableSlot ?? true;

                const firstOpen = scheduleDays.find((d) => d.isOpen && d.canOrderNow) || scheduleDays.find((d) => d.isOpen);
                if (firstOpen) {
                    selectedPreviewDate = firstOpen.dateStr;
                } else if (scheduleDays.length > 0) {
                    selectedPreviewDate = scheduleDays[0].dateStr;
                }

                // หากร้านปิดรับออเดอร์ (สวิตช์ปิด หรือไม่มีรอบเปิดเลยในช่วงที่กำหนด) ให้ขึ้น Alert แจ้งเตือนทันที
                if (storeStatus === 'closed_store') {
                    swal.fire({
                        icon: 'info',
                        title: 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์',
                        text: storeStatusDesc || storeSettings?.closedAlertMessage || 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์ ขออภัยในความไม่สะดวกนะคะ 🍵',
                        confirmButtonColor: '#456f2f',
                        confirmButtonText: 'รับทราบ'
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load store settings:', e);
        } finally {
            isLoadingSchedule = false;
        }
    });
</script>

<svelte:head>
    <title>Home Matcha Cafe | มัทฉะแท้ระดับพรีเมียม @ รพ.ทองผาภูมิ</title>
</svelte:head>

<main class="hero-wrapper">
    <div class="hero-glow-bg"></div>

    <div class="hero-content">
        <!-- แถบแจ้งเตือนสถานะร้าน -->
        {#if storeStatus === 'closed_store'}
            <div class="store-closed-banner" style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 14px; padding: 0.9rem 1.1rem; margin-bottom: 1.25rem;">
                <div style="display: inline-flex; align-items: center; gap: 0.4rem; color: #b91c1c; font-weight: 800; font-size: 0.95rem; margin-bottom: 0.2rem;">
                    <span>⚠️ ขณะนี้ร้านยังไม่เปิดรับออเดอร์</span>
                </div>
                <p style="margin: 0; color: #7f1d1d; font-size: 0.75rem; line-height: 1.4;">
                    {storeStatusDesc || 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์ ขออภัยในความไม่สะดวกนะคะ 🍵 คุณยังสามารถดูรายการเครื่องดื่มได้ค่ะ'}
                </p>
            </div>
        {:else if storeStatus === 'closed_today_can_preorder'}
            <div class="store-notice-banner" style="background: #fffbeb; border: 1.5px solid #fef3c7; border-radius: 14px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; text-align: center;">     
                <p style="margin: 0; color: #92400e; font-size: 0.85rem; font-weight: 600;">
                    <span style="font-size: 1.1rem;">⏰ </span><strong>รอบส่งวันนี้ปิดแล้ว </strong>
                </p>
                <p style="margin: 0; color: #92400e; font-size: 0.85rem; font-weight: 600;">
                    <strong>แต่คุณสามารถสั่งล่วงหน้าสำหรับวันถัดไปได้ค่ะ </strong>
                </p>
                
            </div>
        {:else if storeStatus === 'open'}
               <div class="store-notice-banner" style="background: #fffbeb; border: 1.5px solid var(--border-matcha); border-radius: 14px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-align: center;">
                <span class="pulse-dot" style="background: #16a34a; flex-shrink: 0;"></span>
                <p style="margin: 0; color: var(--matcha-primary); font-size: 0.85rem; font-weight: 600;">
                    <strong>รอบเช้า</strong> 07:00–08:00 | <strong>รอบเที่ยง</strong> 12:30–13:00 
                </p>
            </div>
        {/if}

        <!-- ป้ายรอบจัดส่งของทางร้าน -->
        <!-- <div class="hero-badge delivery-info-pill" style="border-color: {storeStatus === 'closed_store' ? '#fca5a5' : storeStatus === 'closed_today_can_preorder' ? '#fde68a' : 'var(--border-matcha)'}; background: {storeStatus === 'closed_store' ? '#fef2f2' : storeStatus === 'closed_today_can_preorder' ? '#fffdf5' : '#ffffff'};">
            <span class="pulse-dot" style="background: {storeStatus === 'closed_store' ? '#ef4444' : storeStatus === 'closed_today_can_preorder' ? '#f59e0b' : '#16a34a'}; flex-shrink: 0;"></span>
            {#if storeStatus === 'closed_store'}
                <span style="color: #991b1b; font-weight: 700;">🔴 ขณะนี้ร้านยังไม่เปิดรับออเดอร์</span>
            {:else if storeStatus === 'closed_today_can_preorder'}
                <span style="color: #92400e; font-weight: 700;">🟠 ปิดรับรอบวันนี้แล้ว · สั่งล่วงหน้าได้ 🍵</span>
            {:else}
                <span>🚚 <strong>รอบเช้า</strong> 07:00–08:00 | <strong>รอบเที่ยง</strong> 12:30–13:00</span>
                <span class="hide-on-xs" style="color: var(--matcha-primary); font-weight: 700;">· สั่งล่วงหน้าได้ 🍵</span>
            {/if}
        </div> -->

        <!-- ชื่อร้านและคำโปรย -->
        <h1 class="hero-title">Home Matcha Cafe</h1>
        <p class="hero-sub font-kanit">
            สัมผัสรสชาติมัทฉะแท้เกรดพิธีการ ชงสดใหม่แก้วต่อแก้ว 
            พร้อมจัดส่งภายในโรงพยาบาลทองผาภูมิ บ้านพัก และแฟลต
        </p>

                <!-- ภาพโชว์แก้วมัทฉะคู่ -->
        <div class="hero-cups-showcase">
            <img 
                oncontextmenu={(e) => e.preventDefault()} 
                class="protect-img hero-cup-img hero-cup-left" 
                src="/image/matcha-product1.png" 
                alt="Matcha Latte" 
            />
            <img 
                oncontextmenu={(e) => e.preventDefault()} 
                class="protect-img hero-cup-img hero-cup-right" 
                src="/image/matcha-product2.png" 
                alt="Matcha Oat Latte" 
            />
        </div>

        <p class="hero-sub font-kanit" style="font-size: 15px;">สามารถสั่งออเดอร์ล่วงหน้าได้<br>โดยจะมีรอบจัดส่งในวันและเวลาที่ร้านเปิด</p>
        <!-- ปุ่ม Action หลัก (อยู่ใกล้มือ กดง่ายบนมือถือ) -->
        <div class="hero-actions">
            <button 
                onclick={() => {
                    if (storeStatus === 'closed_store') {
                        swal.fire({
                            icon: 'info',
                            title: 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์',
                            text: storeStatusDesc || 'ขณะนี้ร้านยังไม่เปิดรับออเดอร์ ขออภัยในความไม่สะดวกนะคะ 🍵',
                            confirmButtonColor: '#456f2f',
                            confirmButtonText: 'รับทราบ'
                        });
                        return;
                    }
                    goto('/menu');
                }} 
                class="btn-matcha-primary hero-main-btn"
                style={storeStatus === 'closed_store' ? 'opacity: 0.85; filter: grayscale(20%);' : ''}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                    <line x1="6" y1="1" x2="6" y2="4"></line>
                    <line x1="10" y1="1" x2="10" y2="4"></line>
                    <line x1="14" y1="1" x2="14" y2="4"></line>
                </svg>
                {storeStatus === 'closed_store' ? 'ร้านยังไม่เปิดรับออเดอร์' : 'สั่งเครื่องดื่มเลย (Order Now)'}
            </button>
            <button onclick={() => goto('/success')} class="btn-matcha-outline hero-sub-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                เช็คสถานะออเดอร์
            </button>
        </div>



        <!-- เมนูแนะนำพิเศษ -->
        <div class="signature-section">
            <p class="section-overline">
                ✨ เมนูยอดนิยมประจำร้าน
            </p>
            <div class="signature-grid">
                {#each signatureDrinks as d}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        onclick={() => goto(`/order/${d.id}`)}
                        class="menu-card signature-mini-card" 
                    >
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <img src="/image/{d.id}.jpg" alt={d.name} style="width: 56px; height: 56px; border-radius: 12px; object-fit: cover; flex-shrink: 0;" />
                            <div style="min-width: 0; flex: 1;">
                                <span class="status-pill open" style="font-size: 0.62rem; padding: 1px 6px; margin-bottom: 2px;">{d.tag}</span>
                                <h4 style="margin: 0; font-size: 0.92rem; color: var(--matcha-deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{d.name}</h4>
                                <p style="margin: 0; font-size: 0.85rem; font-weight: 700; color: var(--matcha-primary);">{d.price} ฿</p>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- 🌟 ตารางปฏิทิน 7 วันล่วงหน้า (1 แถว 7 คอลัมน์ กะทัดรัด ทันสมัย) -->
        {#if scheduleDays.length > 0}
            <div class="schedule-strip-card">
                <div class="schedule-strip-header">
                    <span class="schedule-strip-title">📅 ตารางเปิดร้าน 7 วันล่วงหน้า</span>
                    <span class="schedule-strip-hint">แตะที่วันเพื่อดูรอบส่ง</span>
                </div>

                <!-- 1 แถว 7 คอลัมน์ตายตัว (ไม่ตกบรรทัดแม้บนมือถือ) -->
                <div class="schedule-7col-grid">
                    {#each scheduleDays as day}
                        {@const isSelected = activePreviewDay?.dateStr === day.dateStr}
                        {@const hasAllDay = day.availableRounds.some((r) => r.id === 'allday')}
                        <button
                            type="button"
                            onclick={() => (selectedPreviewDate = day.dateStr)}
                            class="schedule-col-item {isSelected ? 'selected' : ''} {day.isOpen ? 'is-open' : 'is-closed'}"
                            style="--day-color: {day.dayColor}; --day-bg: {day.dayBgLight};"
                        >
                            <!-- แถบชื่อวัน Mon-Sun สีตามวัน -->
                            <span class="col-day-tag" style="background: {day.dayColor};">
                                {day.dayNameEn}
                            </span>

                            <!-- เลขวันที่ -->
                            <span class="col-date-num">
                                {day.dayNum}
                            </span>

                            <!-- ชื่อวันภาษาไทยย่อ / เดือน -->
                            <span class="col-month-text">
                                {day.dayNameTh.length > 4 ? day.dayNameTh.slice(0, 2) + '.' : day.dayNameTh}
                            </span>

                            <!-- สถานะ เปิด / ปิด -->
                            {#if day.isOpen}
                                <span class="col-status-badge open">
                                    {hasAllDay ? '9-13น.' : 'เปิด'}
                                </span>
                            {:else}
                                <span class="col-status-badge closed">
                                    ปิด
                                </span>
                            {/if}
                        </button>
                    {/each}
                </div>

                <!-- แถบแสดงรายละเอียดของวันที่เลือก -->
                {#if activePreviewDay}
                    <div class="schedule-detail-bar" style="border-left: 4px solid {activePreviewDay.dayColor};">
                        <div class="schedule-detail-info">
                            <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                                <strong style="font-size: 0.85rem; color: #1e293b;">
                                    วัน{activePreviewDay.dayNameTh}ที่ {activePreviewDay.dayNum} {activePreviewDay.monthNameTh}
                                </strong>
                                {#if activePreviewDay.isOpen}
                                    <span style="font-size: 0.7rem; font-weight: 700; background: #dcfce7; color: #166534; padding: 1px 7px; border-radius: 999px;">
                                        🟢 รอบส่ง
                                    </span>
                                {:else}
                                    <span style="font-size: 0.7rem; font-weight: 700; background: #f1f5f9; color: #64748b; padding: 1px 7px; border-radius: 999px;">
                                        ⚪ ร้านปิดบริการ
                                    </span>
                                {/if}
                            </div>

                            {#if activePreviewDay.isOpen}
                                <div class="schedule-rounds-list">
                                    {#each activePreviewDay.availableRounds as r}
                                        <span class="round-chip">
                                            {r.id === 'allday' ? '🕘' : r.id === 'morning' ? '🌤' : '☀️'} {r.name} ({r.timeSlot})
                                        </span>
                                    {/each}
                                </div>
                            {:else}
                                <p style="margin: 0.15rem 0 0 0; font-size: 0.75rem; color: #64748b;">
                                    สามารถเลือกสั่งล่วงหน้าสำหรับวันอื่นที่เปิดร้านได้ค่ะ
                                </p>
                            {/if}
                        </div>

                        {#if activePreviewDay.isOpen}
                            <button
                                type="button"
                                onclick={() => goto('/menu')}
                                class="schedule-order-btn"
                            >
                                สั่งเลย →
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- จุดเด่น 4 ด้าน -->
        <div class="hero-features-grid">
            {#each highlights as h}
                <div class="feature-card">
                    <div class="feature-icon">{h.icon}</div>
                    <h4 class="feature-title">{h.title}</h4>
                    <p class="feature-desc">{h.desc}</p>
                </div>
            {/each}
        </div>
    </div>
</main>

<style>
    .store-closed-banner {
        background: #fef2f2;
        border: 1.5px solid #ef4444;
        border-radius: 14px;
        padding: 0.75rem 1rem;
        width: 100%;
        max-width: 780px;
        margin: 0;
        text-align: center;
        box-shadow: 0 4px 14px rgba(239, 68, 68, 0.12);
    }

    .delivery-info-pill {
        background: rgba(52, 84, 39, 0.08);
        border-color: rgba(52, 84, 39, 0.22);
        color: var(--matcha-deep);
        max-width: 100%;
        margin: 0;
        padding: 0.45rem 0.9rem;
        font-size: 0.78rem;
        flex-wrap: wrap;
        justify-content: center;
    }

    /* Compact 1-Row 7-Column Calendar Strip */
    .schedule-strip-card {
        width: 100%;
        max-width: 780px;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(10px);
        border-radius: 18px;
        padding: 0.9rem 0.85rem;
        box-shadow: 0 6px 22px rgba(27, 45, 22, 0.07);
        border: 1px solid var(--border-light);
        margin: 0;
    }

    .schedule-strip-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.6rem;
        padding: 0 0.15rem;
    }

    .schedule-strip-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--matcha-deep);
    }

    .schedule-strip-hint {
        font-size: 0.72rem;
        color: var(--text-muted);
    }

    .schedule-7col-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.4rem;
        width: 100%;
    }

    .schedule-col-item {
        appearance: none;
        font-family: inherit;
        background: var(--day-bg);
        border: 1.5px solid var(--day-color);
        border-radius: 12px;
        padding: 0.4rem 0.2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        gap: 0.18rem;
        cursor: pointer;
        transition: all 0.18s ease;
        min-width: 0;
        position: relative;
    }

    .schedule-col-item.is-closed {
        opacity: 0.58;
        filter: saturate(0.75);
    }

    .schedule-col-item.selected {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        border-width: 2px;
        opacity: 1;
        filter: none;
    }

    .col-day-tag {
        color: #ffffff;
        font-size: 0.62rem;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        line-height: 1.2;
        max-width: 100%;
    }

    .col-date-num {
        font-family: 'Outfit', sans-serif;
        font-size: 1.1rem;
        font-weight: 800;
        color: #1e293b;
        line-height: 1.1;
        margin-top: 1px;
    }

    .col-month-text {
        font-size: 0.6rem;
        color: #64748b;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .col-status-badge {
        font-size: 0.58rem;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 5px;
        width: 92%;
        text-align: center;
        line-height: 1.2;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .col-status-badge.open {
        background: #16a34a;
        color: #ffffff;
    }

    .col-status-badge.closed {
        background: #94a3b8;
        color: #ffffff;
    }

    .schedule-detail-bar {
        margin-top: 0.65rem;
        background: #f8fafc;
        border-radius: 10px;
        padding: 0.6rem 0.8rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        text-align: left;
    }

    .schedule-detail-info {
        min-width: 0;
        flex: 1;
    }

    .schedule-rounds-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.25rem;
    }

    .round-chip {
        font-size: 0.72rem;
        color: #166534;
        background: #ffffff;
        border: 1px solid #bbf7d0;
        padding: 1px 7px;
        border-radius: 6px;
        font-weight: 600;
    }

    .schedule-order-btn {
        background: var(--matcha-primary);
        color: #ffffff;
        border: none;
        border-radius: 999px;
        padding: 0.4rem 0.85rem;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        font-family: inherit;
    }

    .signature-section {
        width: 100%;
        max-width: 780px;
        margin: 0;
    }

    .section-overline {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--matcha-dark);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin: 0 0 0.65rem 0;
    }

    .signature-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
        width: 100%;
    }

    .signature-mini-card {
        padding: 0.85rem;
        cursor: pointer;
        text-align: left;
        margin: 0;
    }

    @media (max-width: 768px) {
        :global(.hero-features-grid) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 640px) {
        .hide-on-xs {
            display: none;
        }

        .schedule-strip-card {
            padding: 0.65rem 0.45rem;
            border-radius: 16px;
        }

        .schedule-7col-grid {
            gap: 0.22rem;
        }

        .schedule-col-item {
            padding: 0.28rem 0.08rem;
            border-radius: 10px;
        }

        .col-day-tag {
            font-size: 0.54rem;
            padding: 1px 3px;
        }

        .col-date-num {
            font-size: 0.92rem;
        }

        .col-month-text {
            font-size: 0.52rem;
        }

        .col-status-badge {
            font-size: 0.5rem;
            padding: 1px 2px;
        }

        .hero-main-btn,
        .hero-sub-btn {
            width: 100%;
            justify-content: center;
        }

        .signature-grid {
            grid-template-columns: 1fr;
            gap: 0.55rem;
        }
    }
</style>