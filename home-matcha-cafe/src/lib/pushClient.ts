/**
 * Utility functions for Web Push Notifications on client-side
 */

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function isPushNotificationSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getLocalPushSubscription(): Promise<PushSubscription | null> {
    if (!isPushNotificationSupported()) return null;
    try {
        const registration = await navigator.serviceWorker.ready;
        return await registration.pushManager.getSubscription();
    } catch {
        return null;
    }
}

export async function checkServerSubscription(phone: string): Promise<boolean> {
    if (!phone) return false;
    try {
        const res = await fetch(`/api/notifications/subscribe?phone=${encodeURIComponent(phone)}`);
        if (res.ok) {
            const data = await res.json();
            return Boolean(data.isSubscribed);
        }
    } catch {
        // ignore
    }
    return false;
}

export async function subscribeToPush(phone: string): Promise<{ success: boolean; message: string }> {
    if (!isPushNotificationSupported()) {
        return {
            success: false,
            message: 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบ Web Push (หากใช้ iOS กรุณากด "เพิ่มลงหน้าจอโฮม" ก่อนนะคะ)'
        };
    }

    if (!phone) {
        return { success: false, message: 'กรุณาเข้าสู่ระบบสมาชิกก่อนเปิดรับการแจ้งเตือนค่ะ' };
    }

    try {
        // 1. ขอ Permission จากผู้ใช้
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return {
                success: false,
                message: 'คุณได้ปฏิเสธสิทธิ์การแจ้งเตือน กรุณาเปิดการอนุญาตแจ้งเตือนในการตั้งค่าเบราว์เซอร์นะคะ'
            };
        }

        // 2. ดึง VAPID Public Key จากเซิร์ฟเวอร์
        const keyRes = await fetch('/api/notifications/vapid-key');
        if (!keyRes.ok) throw new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์แจ้งเตือนได้');
        const { publicKey } = await keyRes.json();
        if (!publicKey) throw new Error('ไม่พบ VAPID public key');

        // 3. ขอ Subscription ผ่าน ServiceWorker PushManager
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey) as any
            });
        }

        // 4. ส่ง Subscription ขึ้นเซิร์ฟเวอร์ผูกกับเบอร์โทร
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const saveRes = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: cleanPhone,
                subscription: subscription.toJSON(),
                userAgent: navigator.userAgent
            })
        });

        const data = await saveRes.json();
        if (!saveRes.ok || !data.success) {
            throw new Error(data.message || 'บันทึกการแจ้งเตือนไม่สำเร็จ');
        }

        return { success: true, message: 'เปิดรับการแจ้งเตือนสถานะสำเร็จแล้วค่ะ 🍵' };
    } catch (err: any) {
        console.error('Subscription error:', err);
        return { success: false, message: err?.message || 'เกิดข้อผิดพลาดในการเปิดรับการแจ้งเตือน' };
    }
}

export async function unsubscribeFromPush(phone: string): Promise<{ success: boolean; message: string }> {
    if (!isPushNotificationSupported()) {
        return { success: true, message: 'ยกเลิกเรียบร้อย' };
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await fetch('/api/notifications/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            await subscription.unsubscribe();
        }
        return { success: true, message: 'ปิดการแจ้งเตือนเรียบร้อยแล้วค่ะ' };
    } catch (err: any) {
        return { success: false, message: err?.message || 'เกิดข้อผิดพลาดในการปิดการแจ้งเตือน' };
    }
}
