<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import swal from 'sweetalert2';

    interface OrderRecord {
        id: string;
        order_id: string;
        name: string;
        phone: string;
        address: string;
        message?: string;
        basket: Array<{
            id: string;
            name?: string;
            thaiName?: string;
            englishName?: string;
            price: number;
            addonName?: string;
            addonPrice?: number;
            quantity: number;
            sweetness?: number;
            note?: string;
        }>;
        totalPrice: number;
        slipImage?: string;
        deliveryDate?: string;
        deliveryRound?: string;
        deliveryRoundId?: string;
        status: 'pending' | 'paid' | 'brewing' | 'delivering' | 'completed' | 'cancelled' | 'ready_to_ship';
        createdAt: string;
        updatedAt: string;
    }

    let ordersList = $state<OrderRecord[]>([]);
    let searchPhone = $state('');
    let loading = $state(true);

    const statusSteps = [
        { key: 'pending', label: 'รับออเดอร์', desc: 'รอตรวจสลิป' },
        { key: 'paid', label: 'ตรวจสลิปแล้ว', desc: 'เตรียมชง' },
        { key: 'brewing', label: 'กำลังชง', desc: 'บาริสต้ากำลังทำ' },
        { key: 'ready_to_ship', label: 'ชงเสร็จแล้ว', desc: 'รอรอบส่ง' },
        { key: 'delivering', label: 'กำลังส่ง', desc: 'ส่งถึงตึก' },
        { key: 'completed', label: 'จัดส่งแล้ว', desc: 'เสร็จสิ้น' }
    ];

    function getStepIndex(status: string): number {
        const map: Record<string, number> = {
            'pending': 0,
            'paid': 1,
            'brewing': 2,
            'ready_to_ship': 3,
            'delivering': 4,
            'completed': 5,
            'cancelled': -1
        };
        return map[status] ?? 0;
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'pending': return { label: 'รอตรวจสอบสลิป', class: 'pending' };
            case 'paid': return { label: 'รับยอดชำระแล้ว (รอชง)', class: 'paid' };
            case 'brewing': return { label: '🍵 กำลังชงสดใหม่', class: 'brewing' };
            case 'ready_to_ship': return { label: '✨ ชงเสร็จแล้ว (รอส่ง)', class: 'brewing' };
            case 'delivering': return { label: '🛵 กำลังนำส่งถึงตึก', class: 'delivering' };
            case 'completed': return { label: '✅ จัดส่งเรียบร้อย', class: 'completed' };
            case 'cancelled': return { label: 'ยกเลิกออเดอร์', class: 'cancelled' };
            default: return { label: status, class: 'pending' };
        }
    }

    function formatTime(isoStr: string) {
        if (!isoStr) return '-';
        try {
            const date = new Date(isoStr);
            return date.toLocaleString('th-TH', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        } catch {
            return isoStr;
        }
    }

    async function fetchHistory(phoneToFetch?: string) {
        loading = true;
        try {
            const targetPhone = phoneToFetch ?? searchPhone;
            const res = await fetch('/api/get-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: targetPhone })
            });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    ordersList = data;
                } else {
                    ordersList = [];
                }
            }
        } catch (e) {
            console.error('Error loading history:', e);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        const rawPhone = localStorage.getItem('phone');
        if (rawPhone) {
            try {
                searchPhone = JSON.parse(rawPhone);
            } catch {
                searchPhone = rawPhone.replace(/"/g, '');
            }
        }
        fetchHistory();
    });

    function copyOrderId(id: string) {
        navigator.clipboard.writeText(id);
        const toast = swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1500
        });
        toast.fire({
            icon: 'success',
            title: `คัดลอกรหัส ${id} แล้ว`
        });
    }
</script>

<svelte:head>
    <title>ประวัติและติดตามสถานะออเดอร์ | Home Matcha Cafe</title>
</svelte:head>

<main class="menu-page-wrapper">
    <div class="menu-header">
        <span class="menu-header-badge">📦 ORDER TRACKING & HISTORY</span>
        <h1 class="menu-main-title">ติดตามสถานะและประวัติคำสั่งซื้อ</h1>
        <p class="menu-subtitle">
            ดูสถานะเครื่องดื่มของคุณแบบเรียลไทม์ หรือค้นหาตามเบอร์โทรศัพท์
        </p>
    </div>

    <!-- Search Phone Box -->
    <div style="width: 100%; max-width: 680px; margin-bottom: 2rem;">
        <form onsubmit={(e) => { e.preventDefault(); fetchHistory(); }} style="display: flex; gap: 0.5rem;">
            <input 
                type="tel" 
                class="form-input" 
                bind:value={searchPhone} 
                placeholder="กรอกเบอร์โทรศัพท์ที่ใช้สั่งซื้อ (เช่น 0812345678)" 
                style="flex-grow: 1;"
            />
            <button type="submit" class="btn-matcha-primary" style="padding: 0.75rem 1.5rem; white-space: nowrap;">
                ค้นหาออเดอร์
            </button>
        </form>
    </div>

    <!-- Orders List Section -->
    <div style="width: 100%; max-width: 720px; display: flex; flex-direction: column; gap: 1.5rem;">
        {#if loading}
            <div style="text-align: center; padding: 3rem 0;">
                <div class="spinner" style="margin: 0 auto 1rem auto;"></div>
                <p style="color: var(--text-muted); font-size: 0.95rem;">กำลังโหลดข้อมูลคำสั่งซื้อ...</p>
            </div>
        {:else if ordersList.length === 0}
            <div class="form-card" style="text-align: center; padding: 3rem 1.5rem;">
                <p style="font-size: 3rem; margin: 0 0 1rem 0;">🍵</p>
                <h3 style="margin: 0 0 0.5rem 0; color: var(--matcha-deep);">ยังไม่พบประวัติคำสั่งซื้อ</h3>
                <p style="margin: 0 0 1.5rem 0; color: var(--text-muted); font-size: 0.9rem;">
                    ลองค้นหาด้วยเบอร์โทรศัพท์อื่น หรือเริ่มสั่งเครื่องดื่มมัทฉะแก้วโปรดของคุณได้เลยครับ
                </p>
                <button onclick={() => goto('/menu')} class="btn-matcha-primary">
                    สั่งเครื่องดื่มตอนนี้
                </button>
            </div>
        {:else}
            {#each ordersList as order}
                {@const badge = getStatusBadge(order.status)}
                {@const currentStepIdx = getStepIndex(order.status)}

                <div class="form-card" style="text-align: left;">
                    <!-- Order Header -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-light);">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <h3 style="margin: 0; font-size: 1.15rem; color: var(--matcha-deep);">
                                    {order.order_id || order.id}
                                </h3>
                                <button 
                                    onclick={() => copyOrderId(order.order_id || order.id)} 
                                    title="คัดลอกรหัสออเดอร์" 
                                    style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px;"
                                >
                                    📋
                                </button>
                            </div>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">
                                สั่งเมื่อ: {formatTime(order.createdAt)}
                            </span>
                        </div>

                        <span class="status-pill {badge.class}">
                            <span class="pulse-dot"></span>
                            {badge.label}
                        </span>
                    </div>

                    <!-- Progress Stepper (ถ้าไม่ถูกยกเลิก) -->
                    {#if order.status !== 'cancelled'}
                        <div style="margin: 1.2rem 0; padding: 0.75rem 0.5rem; background: var(--matcha-tint); border-radius: var(--radius-lg); border: 1px solid var(--border-matcha);">
                            <div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.15rem; align-items: start;">
                                {#each statusSteps as step, idx}
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem; z-index: 2; min-width: 0; text-align: center;">
                                        <div style="width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; background: {idx <= currentStepIdx ? 'var(--matcha-primary)' : 'var(--bg-surface)'}; color: {idx <= currentStepIdx ? '#fff' : 'var(--text-muted)'}; border: 2px solid {idx <= currentStepIdx ? 'var(--matcha-primary)' : 'var(--border-light)'}; box-shadow: {idx === currentStepIdx ? '0 0 10px rgba(69, 111, 47, 0.4)' : 'none'};">
                                            {idx <= currentStepIdx ? '✓' : idx + 1}
                                        </div>
                                        <span style="font-size: clamp(0.56rem, 1.8vw, 0.7rem); line-height: 1.2; font-weight: {idx === currentStepIdx ? '700' : '500'}; color: {idx === currentStepIdx ? 'var(--matcha-dark)' : 'var(--text-muted)'};">
                                            {step.label}
                                        </span>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- รายละเอียดการจัดส่ง -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; font-size: 0.875rem; margin-bottom: 1.25rem; background: var(--bg-warm-light); padding: 0.85rem; border-radius: var(--radius-md);">
                        {#if order.deliveryDate || order.deliveryRound}
                            <div style="grid-column: 1 / -1; background: var(--matcha-tint); border: 1px solid var(--border-matcha); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); display: flex; flex-direction: column; align-items: flex-start; gap: 0.45rem;">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; width: 100%;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">📅 วันที่จัดส่ง:</span>
                                    <strong style="color: var(--matcha-deep); font-size: 0.9rem;">{order.deliveryDate || 'วันนี้'}</strong>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; width: 100%;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">🚚 รอบส่ง:</span>
                                    <span style="display: inline-block; font-weight: 700; color: var(--matcha-dark); background: #fff; padding: 0.25rem 0.65rem; border-radius: 999px; border: 1px solid var(--border-matcha); font-size: 0.8rem; max-width: 100%; word-break: break-word;">
                                        {order.deliveryRound || 'รอบปกติ'}
                                    </span>
                                </div>
                            </div>
                        {/if}
                        <div>
                            <p style="margin: 0; color: var(--text-muted); font-size: 0.75rem;">ผู้รับ</p>
                            <p style="margin: 0; font-weight: 600; color: var(--matcha-deep);">{order.name} ({order.phone})</p>
                        </div>
                        <div>
                            <p style="margin: 0; color: var(--text-muted); font-size: 0.75rem;">สถานที่จัดส่ง</p>
                            <p style="margin: 0; font-weight: 600; color: var(--matcha-deep);">{order.address}</p>
                        </div>
                        {#if order.message}
                            <div style="grid-column: 1 / -1;">
                                <p style="margin: 0; color: var(--text-muted); font-size: 0.75rem;">หมายเหตุ</p>
                                <p style="margin: 0; color: var(--text-secondary);">{order.message}</p>
                            </div>
                        {/if}
                    </div>

                    <!-- รายการสินค้า -->
                    <div style="margin-bottom: 1rem;">
                        <p style="margin: 0 0 0.5rem 0; font-weight: 700; font-size: 0.9rem; color: var(--matcha-deep);">
                            รายการเครื่องดื่ม ({order.basket?.reduce((sum, it) => sum + (it.quantity || 1), 0) || 0} แก้ว)
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                            {#each (order.basket || []) as item}
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; padding: 0.35rem 0; border-bottom: 1px dashed var(--border-light); gap: 0.5rem;">
                                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem;">
                                        <span style="font-weight: 600; color: var(--text-primary);">{item.thaiName || item.name || item.id}</span>
                                        <span style="font-size: 0.75rem; color: var(--matcha-dark);">หวาน {item.sweetness ?? 50}%</span>
                                        {#if item.addonName}
                                            <span style="font-size: 0.72rem; font-weight: 700; color: #166534; background: #dcfce7; border: 1px solid #86efac; padding: 0.08rem 0.45rem; border-radius: 999px;">
                                                +{item.addonName} (+{item.addonPrice || 0}฿)
                                            </span>
                                        {/if}
                                    </div>
                                    <div style="display: flex; gap: 1rem; align-items: center; flex-shrink: 0;">
                                        <span style="color: var(--text-muted);">x{item.quantity}</span>
                                        <span style="font-weight: 700; color: var(--matcha-dark); min-width: 45px; text-align: right;">
                                            {(item.price || 0) * (item.quantity || 1)} ฿
                                        </span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- ยอดสุทธิและปุ่มสั่งเพิ่ม -->
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid var(--border-light);">
                        <div>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">ยอดชำระสุทธิ</span>
                            <div style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 700; color: var(--matcha-dark);">
                                {order.totalPrice} <span style="font-size: 0.85rem; font-weight: 500;">บาท</span>
                            </div>
                        </div>

                        <button onclick={() => goto('/menu')} class="btn-matcha-outline" style="font-size: 0.85rem;">
                            สั่งเครื่องดื่มเพิ่ม
                        </button>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</main>