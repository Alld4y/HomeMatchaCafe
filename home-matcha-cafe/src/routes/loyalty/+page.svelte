<script lang="ts">
    import { goto } from '$app/navigation';
    import { getContext, onMount } from 'svelte';

    const memberCtx = getContext<any>('memberData');

    let member = $derived(memberCtx?.member || null);
    let loyaltySettings = $derived(
        memberCtx?.loyaltySettings || { enabled: true, stampsRequired: 10, expireDays: 60 }
    );

    let stampsRequired = $derived(Number(loyaltySettings.stampsRequired) || 10);
    let currentPoints = $derived(Number(member?.points) || 0);
    let currentCardStamps = $derived(
        currentPoints >= stampsRequired ? stampsRequired : currentPoints % stampsRequired
    );
    let availableFreeCups = $derived(Math.floor(currentPoints / stampsRequired));

    let stampSlots = $derived(Array.from({ length: stampsRequired }, (_, i) => i + 1));

    function formatThaiDate(isoStr: string | null) {
        if (!isoStr) return '-';
        try {
            return new Date(isoStr).toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return '-';
        }
    }

    function getRemainingDays(isoStr: string | null): number | null {
        if (!isoStr) return null;
        const diffMs = new Date(isoStr).getTime() - Date.now();
        return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    onMount(() => {
        if (memberCtx?.refreshMember) {
            memberCtx.refreshMember();
        }
    });
</script>

<svelte:head>
    <title>บัตรสะสมแต้ม | Home Matcha Cafe</title>
</svelte:head>

<main class="loyalty-page">
    <div class="loyalty-container">
        {#if loyaltySettings.enabled === false}
            <div class="guest-loyalty-card">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">🍵</div>
                <h1 style="margin: 0 0 0.4rem 0; font-size: 1.45rem; font-weight: 800; color: var(--matcha-deep);">
                    ระบบบัตรสะสมแต้มปิดให้บริการชั่วคราว
                </h1>
                <p style="margin: 0 0 1.25rem 0; font-size: 0.92rem; color: var(--text-secondary); line-height: 1.5;">
                    ขณะนี้ทางร้านปิดระบบสะสมแต้มและแลกแก้วฟรีชั่วคราวค่ะ<br />
                    คุณลูกค้ายังสามารถเลือกสั่งเมนูเครื่องดื่มได้ตามปกตินะคะ 💚
                </p>
                <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn-matcha-primary" onclick={() => goto('/menu')}>
                        🍵 ไปเลือกเมนูเครื่องดื่ม
                    </button>
                    <button type="button" class="btn-matcha-outline" onclick={() => goto('/')}>
                        กลับหน้าแรก
                    </button>
                </div>
            </div>
        {:else if !member}
            <div class="guest-loyalty-card">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">🍵</div>
                <h1 style="margin: 0 0 0.4rem 0; font-size: 1.5rem; font-weight: 800; color: var(--matcha-deep);">
                    บัตรสะสมแต้ม Home Matcha Cafe
                </h1>
                <p style="margin: 0 0 1.25rem 0; font-size: 0.92rem; color: var(--text-secondary); line-height: 1.5;">
                    สะสมครบ <strong>{stampsRequired} แก้ว</strong> รับฟรีทันที <strong>1 แก้ว</strong>!<br />
                    (บันทึกแต้มอัตโนมัติเมื่อจัดส่งสำเร็จ · อายุบัตร {loyaltySettings.expireDays} วันนับจากแก้วแรก)
                </p>

                <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                    <button
                        type="button"
                        class="btn-matcha-primary"
                        onclick={() => memberCtx?.openAuthModal('login')}
                    >
                        🔐 เข้าสู่ระบบสมาชิก
                    </button>
                    <button
                        type="button"
                        class="btn-matcha-outline"
                        onclick={() => memberCtx?.openAuthModal('register')}
                    >
                        ✨ สมัครสมาชิกใหม่
                    </button>
                </div>
            </div>
        {:else}
            <!-- บัตรสะสมแต้มดีไซน์พรีเมียม -->
            <div class="stamp-card-shell">
                <div class="stamp-card-header">
                    <div class="stamp-brand-row">
                        <div>
                            <span class="stamp-card-badge">HOME MATCHA LOYALTY CARD</span>
                            <h1 class="stamp-card-title">บัตรสะสมแต้มมัทฉะ</h1>
                        </div>
                        <div class="stamp-count-Chip">
                            <span style="font-size: 1.3rem; font-weight: 900; white-space: nowrap;">{currentPoints}</span>
                            <span style="font-size: 0.78rem; opacity: 0.92; white-space: nowrap;">/ {stampsRequired} ดวง</span>
                        </div>
                    </div>

                    <div class="member-meta-bar">
                        <div style="min-width: 0;">
                            <p style="margin: 0; font-size: 0.72rem; opacity: 0.85;">ชื่อสมาชิก</p>
                            <p style="margin: 0; font-size: 0.95rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">คุณ {member.fullName}</p>
                        </div>
                        <div style="text-align: right; flex-shrink: 0;">
                            <p style="margin: 0; font-size: 0.72rem; opacity: 0.85;">เบอร์โทรศัพท์</p>
                            <p style="margin: 0; font-size: 0.92rem; font-weight: 700; white-space: nowrap;">{member.phone}</p>
                        </div>
                    </div>
                </div>

                <!-- แจ้งเตือนสิทธิ์แลกแก้วฟรีหากสะสมครบ -->
                {#if availableFreeCups > 0}
                    <div class="reward-ready-banner">
                        <div style="flex: 1; min-width: 180px;">
                            <p style="margin: 0; font-weight: 800; font-size: 0.92rem; color: #14532d;">
                                🎉 ยินดีด้วย! คุณมีสิทธิ์แลกเครื่องดื่มฟรี {availableFreeCups} แก้ว
                            </p>
                            <p style="margin: 0.15rem 0 0 0; font-size: 0.76rem; color: #166534;">
                                สามารถกดใช้สิทธิ์ลดราคาฟรี 1 แก้วได้ในหน้าสรุปคำสั่งซื้อ หรือแจ้งแอดมินได้เลยค่ะ
                            </p>
                        </div>
                        <button
                            type="button"
                            class="btn-matcha-primary"
                            style="padding: 0.5rem 1rem; font-size: 0.82rem; white-space: nowrap;"
                            onclick={() => goto('/menu')}
                        >
                            ไปเลือกเมนูแลกฟรี ➔
                        </button>
                    </div>
                {/if}

                <!-- ตารางวงกลมตราปั๊ม 5 แถว 2 คอลัมน์ (2 คอลัมน์เสมอ) -->
                <div class="stamp-card-body">
                    <p style="text-align: center; margin: 0 0 1rem 0; font-size: 0.82rem; color: #4b6340; font-weight: 600;">
                        สะสมครบ {stampsRequired} แก้ว รับฟรี 1 แก้ว (1 แก้ว = 1 ตราปั๊มใบมัทฉะ)
                    </p>

                    <div class="stamps-grid-5x2">
                        {#each stampSlots as slotNum}
                            {@const isStamped = slotNum <= currentCardStamps}
                            {@const isRewardSlot = slotNum === stampsRequired}
                            <div class="stamp-circle-slot {isStamped ? 'stamped' : ''} {isRewardSlot ? 'reward-slot' : ''}">
                                {#if isStamped}
                                    <!-- ตราปั๊มรูปใบมัทฉะ (Matcha Leaf Stamp SVG) -->
                                    <div class="matcha-stamp-seal" style="transform: rotate({(slotNum % 2 === 0 ? 1 : -1) * ((slotNum * 3) % 11)}deg);">
                                        <svg viewBox="0 0 64 64" width="46" height="46" fill="none">
                                            <circle cx="32" cy="32" r="29" stroke="#2d5a27" stroke-width="2.5" stroke-dasharray="4 2" fill="rgba(78, 132, 59, 0.12)" />
                                            <path
                                                d="M46 16C32 16 18 26 18 42C18 44.5 19.5 46 22 46C38 46 48 32 48 18C48 16.8 47.2 16 46 16Z"
                                                fill="#2d5a27"
                                            />
                                            <path
                                                d="M18 46C25 39 34 30 45 19"
                                                stroke="#e9f5e1"
                                                stroke-width="2.2"
                                                stroke-linecap="round"
                                            />
                                            <path
                                                d="M27 37L23 31M34 30L29 24M39 25L36 20"
                                                stroke="#e9f5e1"
                                                stroke-width="1.8"
                                                stroke-linecap="round"
                                            />
                                        </svg>
                                        <span class="stamp-seal-text">MATCHA #{slotNum}</span>
                                    </div>
                                {:else}
                                    <div class="empty-slot-inner">
                                        {#if isRewardSlot}
                                            <span style="font-size: 1.35rem;">🎁</span>
                                            <span class="slot-num-label" style="color: #b45309; font-weight: 800;">FREE CUP</span>
                                        {:else}
                                            <span class="slot-number">{slotNum}</span>
                                            <span class="slot-num-label">แก้วที่ {slotNum}</span>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- ส่วนท้ายบัตร: วันหมดอายุ 60 วันนับจากแก้วแรก -->
                <div class="stamp-card-footer">
                    <div class="expiry-info-row">
                        <div class="expiry-col">
                            <span class="expiry-label">📅 วันเริ่มสะสมแก้วแรก</span>
                            <strong class="expiry-val start-val">
                                {member.cardStartedAt ? formatThaiDate(member.cardStartedAt) : 'รอสั่งซื้อแก้วแรก'}
                            </strong>
                        </div>
                        <div class="expiry-col right">
                            <span class="expiry-label">
                                ⏳ วันหมดอายุบัตร ({loyaltySettings.expireDays} วัน)
                            </span>
                            <strong class="expiry-val exp-val">
                                {#if member.cardExpiresAt}
                                    <span>{formatThaiDate(member.cardExpiresAt)}</span>
                                    {#if getRemainingDays(member.cardExpiresAt) !== null}
                                        <span class="remaining-days-badge">
                                            อีก {getRemainingDays(member.cardExpiresAt)} วัน
                                        </span>
                                    {/if}
                                {:else}
                                    <span>อายุ {loyaltySettings.expireDays} วันจากแก้วแรก</span>
                                {/if}
                            </strong>
                        </div>
                    </div>

                    <div class="summary-bottom-row">
                        <span class="summary-pill">🍵 สะสมรวม: <strong>{member.totalStampsEarned ?? 0} แก้ว</strong></span>
                        <span class="summary-pill">🎁 แลกฟรีแล้ว: <strong>{member.totalFreeRedeemed ?? 0} แก้ว</strong></span>
                    </div>
                </div>
            </div>

            <div class="loyalty-bottom-actions">
                <button type="button" class="btn-matcha-primary" onclick={() => goto('/menu')}>
                    🍵 สั่งเครื่องดื่มเพิ่มแต้ม
                </button>
                <button type="button" class="btn-matcha-outline" onclick={() => goto('/')}>
                    กลับหน้าแรก
                </button>
            </div>
        {/if}
    </div>
</main>

<style>
    .loyalty-page {
        min-height: 100vh;
        padding: 6.2rem 1rem 5.5rem 1rem;
        display: flex;
        justify-content: center;
        align-items: flex-start;
    }

    .loyalty-container {
        width: 100%;
        max-width: 480px;
    }

    .guest-loyalty-card {
        background: #ffffff;
        border: 1.5px solid #d5e6cc;
        border-radius: 24px;
        padding: 2.2rem 1.5rem;
        text-align: center;
        box-shadow: 0 14px 36px rgba(35, 62, 24, 0.08);
    }

    .stamp-card-shell {
        background: #fbfdf9;
        border-radius: 26px;
        overflow: hidden;
        border: 2px solid #c5dcb8;
        box-shadow: 0 20px 45px rgba(32, 60, 24, 0.14);
    }

    .stamp-card-header {
        background: linear-gradient(135deg, #1e3f18 0%, #3a6b2c 60%, #4e873c 100%);
        color: #ffffff;
        padding: 1.35rem 1.25rem 1.15rem 1.25rem;
    }

    .stamp-brand-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.65rem;
        margin-bottom: 1rem;
    }

    .stamp-card-badge {
        font-size: 0.63rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #cde8be;
        display: block;
        margin-bottom: 0.15rem;
    }

    .stamp-card-title {
        margin: 0;
        font-size: clamp(1.15rem, 4.5vw, 1.35rem);
        font-weight: 900;
        line-height: 1.15;
    }

    .stamp-count-Chip {
        background: rgba(255, 255, 255, 0.18);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.35);
        padding: 0.32rem 0.75rem;
        border-radius: 999px;
        display: inline-flex;
        align-items: baseline;
        gap: 0.25rem;
        flex-shrink: 0;
        white-space: nowrap;
    }

    .member-meta-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        background: rgba(0, 0, 0, 0.18);
        padding: 0.65rem 0.9rem;
        border-radius: 14px;
    }

    .reward-ready-banner {
        background: linear-gradient(135deg, #dcfce7, #bbf7d0);
        border-bottom: 1.5px solid #86efac;
        padding: 0.9rem 1.15rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .stamp-card-body {
        padding: 1.25rem 1.1rem;
        background: radial-gradient(circle at center, #ffffff 0%, #f3f9ef 100%);
    }

    /* 5 แถว 2 คอลัมน์ (2 คอลัมน์เสมอ) */
    .stamps-grid-5x2 {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.9rem 1.1rem;
        max-width: 310px;
        margin: 0 auto;
    }

    .stamp-circle-slot {
        aspect-ratio: 1 / 1;
        width: 100%;
        max-width: 120px;
        margin: 0 auto;
        border-radius: 50%;
        border: 2.5px dashed #b9d3aa;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: all 0.25s ease;
        box-shadow: inset 0 2px 6px rgba(45, 75, 35, 0.05);
    }

    .stamp-circle-slot.stamped {
        border: 2.5px solid #3c6e2d;
        background: linear-gradient(135deg, #f2faed, #e3f4d9);
        box-shadow: 0 6px 16px rgba(55, 102, 41, 0.16);
    }

    .stamp-circle-slot.reward-slot:not(.stamped) {
        border-color: #f59e0b;
        background: #fffbeb;
    }

    .matcha-stamp-seal {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        animation: stampPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .stamp-seal-text {
        font-size: 0.6rem;
        font-weight: 900;
        color: #254d1c;
        letter-spacing: 0.04em;
        margin-top: 0.1rem;
    }

    .empty-slot-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #93af85;
    }

    .slot-number {
        font-size: 1.35rem;
        font-weight: 900;
        line-height: 1.1;
    }

    .slot-num-label {
        font-size: 0.68rem;
        font-weight: 700;
    }

    .stamp-card-footer {
        background: #eff7ea;
        border-top: 1.5px solid #d5e7cb;
        padding: 0.95rem 1.1rem;
    }

    .expiry-info-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }

    .expiry-col {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
    }

    .expiry-col.right {
        text-align: right;
        align-items: flex-end;
    }

    .expiry-label {
        font-size: 0.72rem;
        color: #5c7054;
        white-space: nowrap;
    }

    .expiry-val {
        font-size: 0.84rem;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        flex-wrap: nowrap;
        white-space: nowrap;
    }

    .expiry-val.start-val {
        color: #1f3518;
    }

    .expiry-val.exp-val {
        color: #b91c1c;
    }

    .remaining-days-badge {
        background: #dcfce7;
        color: #15803d;
        border: 1px solid #86efac;
        font-size: 0.68rem;
        font-weight: 800;
        padding: 0.1rem 0.42rem;
        border-radius: 999px;
        white-space: nowrap;
    }

    .summary-bottom-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        padding-top: 0.7rem;
        border-top: 1px dashed #cfe0c7;
        font-size: 0.78rem;
        color: #4d6344;
    }

    .summary-pill {
        white-space: nowrap;
        background: #ffffff;
        border: 1px solid #d7e8ce;
        padding: 0.28rem 0.65rem;
        border-radius: 999px;
        font-size: 0.75rem;
    }

    .loyalty-bottom-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        margin-top: 1.25rem;
    }

    @media (max-width: 420px) {
        .stamp-card-footer {
            padding: 0.85rem 0.85rem;
        }
        .expiry-label {
            font-size: 0.68rem;
        }
        .expiry-val {
            font-size: 0.78rem;
        }
        .remaining-days-badge {
            font-size: 0.64rem;
            padding: 0.08rem 0.36rem;
        }
        .summary-pill {
            font-size: 0.72rem;
            padding: 0.25rem 0.55rem;
        }
        .loyalty-bottom-actions {
            flex-direction: column;
        }
        .loyalty-bottom-actions button {
            width: 100%;
        }
    }

    @keyframes stampPop {
        0% { transform: scale(1.4); opacity: 0.4; }
        100% { transform: scale(1); opacity: 1; }
    }
</style>
