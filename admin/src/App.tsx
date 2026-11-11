import React, { useState, useEffect, useRef } from 'react';
import { formatKurus } from '@kardesler/shared';

interface LiveOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  address: string;
  items: {
    name: string;
    quantity: number;
    options: string[];
  }[];
  customerNote?: string;
  paymentMethod: 'card_online' | 'cash_on_delivery';
  totalKurus: number;
  status: 'new' | 'accepted' | 'on_the_way' | 'delivered' | 'cancelled' | 'rejected';
  printStatus: 'pending' | 'printed' | 'failed';
  createdAt: string;
}

export default function App() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [orders, setOrders] = useState<LiveOrder[]>([
    {
      id: 'ord-101',
      orderNumber: 28,
      customerName: 'Ahmet Yılmaz',
      customerPhone: '+90 532 555 1234',
      address: 'Kılıçali Paşa Mah. Sıraselviler Cad. No:14 D:3, Cihangir',
      items: [
        {
          name: 'Zırh Kıyma Adana Kebap',
          quantity: 2,
          options: ['1.5 Porsiyon (+160 TL)', 'Bol Sumaklı Soğanlı'],
        },
        {
          name: 'Köy Ayranı (Açık)',
          quantity: 2,
          options: [],
        },
      ],
      customerNote: 'Lütfen zile basmayın, bebek uyuyor. Kapıya bırakabilirsiniz.',
      paymentMethod: 'cash_on_delivery',
      totalKurus: 108000, // 1,080.00 TL
      status: 'new',
      printStatus: 'pending',
      createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const audioContextRef = useRef<AudioContext | null>(null);

  // Browser Audio Unlock
  const handleUnlockAudio = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
        // Play brief silent beep to satisfy browser autoplay policy
        const osc = audioContextRef.current.createOscillator();
        const gain = audioContextRef.current.createGain();
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(audioContextRef.current.destination);
        osc.start();
        osc.stop(audioContextRef.current.currentTime + 0.1);
        setAudioUnlocked(true);
      }
    } catch (e) {
      console.error('Audio unlock failed', e);
      setAudioUnlocked(true);
    }
  };

  // Sound alert beep for new orders
  const playAlertSound = () => {
    if (!audioContextRef.current) return;
    try {
      const osc = audioContextRef.current.createOscillator();
      const gain = audioContextRef.current.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioContextRef.current.currentTime);
      gain.gain.setValueAtTime(0.3, audioContextRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioContextRef.current.destination);
      osc.start();
      osc.stop(audioContextRef.current.currentTime + 0.6);
    } catch (e) {
      console.error('Sound trigger error', e);
    }
  };

  // Repeating alarm for pending new orders
  useEffect(() => {
    const hasNewOrders = orders.some((o) => o.status === 'new');
    if (audioUnlocked && hasNewOrders) {
      const interval = setInterval(() => {
        playAlertSound();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [audioUnlocked, orders]);

  // Order Actions
  const handleAcceptOrder = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status: 'accepted', printStatus: 'printed' }
          : o,
      ),
    );
  };

  const handleUpdateStatus = (
    orderId: string,
    newStatus: 'on_the_way' | 'delivered' | 'cancelled' | 'rejected',
  ) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
    );
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      {/* Header Bar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#b91c1c' }}>
            🍢 Kardeşler Cihangir - Canlı Mutfak Paneli
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            لوحة إدارة واستلام الطلبات الحية مع التنبيه الصوتي والطباعة الفورية
          </p>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Pause Order Switch */}
          <button
            onClick={() => setIsAcceptingOrders(!isAcceptingOrders)}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 'bold',
              cursor: 'pointer',
              backgroundColor: isAcceptingOrders ? '#16a34a' : '#dc2626',
              color: '#ffffff',
            }}
          >
            {isAcceptingOrders ? '🟢 Sipariş Alımı Açık (Accepting)' : '🔴 Sipariş Alımı Durduruldu (Paused)'}
          </button>

          {/* Browser Audio Unlock Button */}
          {!audioUnlocked ? (
            <button
              onClick={handleUnlockAudio}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#f59e0b',
                color: '#ffffff',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              🔊 Sesi Aç (Start Audio Alerts)
            </button>
          ) : (
            <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '14px' }}>
              🔊 Ses Aktif (Audio Ready)
            </span>
          )}
        </div>
      </header>

      {/* Live Orders Feed */}
      <main>
        <h2 style={{ fontSize: '18px', color: '#334155', marginBottom: '16px' }}>
          Gelen Siparişler (Active Orders - {orders.length})
        </h2>

        {orders.length === 0 ? (
          <div style={{ background: '#ffffff', padding: '48px', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
            Şu an bekleyen yeni sipariş bulunmuyor (No pending orders).
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
            {orders.map((order) => (
              <div
                key={order.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: order.status === 'new' ? '0 0 0 3px #ef4444' : '0 1px 3px rgba(0,0,0,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  {/* Order Top Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#b91c1c' }}>
                      #{order.orderNumber}
                    </span>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        backgroundColor: order.status === 'new' ? '#fee2e2' : '#dcfce7',
                        color: order.status === 'new' ? '#dc2626' : '#15803d',
                      }}
                    >
                      {order.status === 'new' ? 'YENİ SİPARİŞ (NEW)' : order.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Customer Info */}
                  <div style={{ fontSize: '14px', marginBottom: '12px', color: '#1e293b' }}>
                    <strong>{order.customerName}</strong> ({order.customerPhone})
                    <div style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>
                      📍 {order.address}
                    </div>
                  </div>

                  {/* Items List */}
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{ marginBottom: '8px', fontSize: '14px' }}>
                        <span style={{ fontWeight: 'bold', color: '#0f172a' }}>
                          {item.quantity}x {item.name}
                        </span>
                        {item.options.map((opt, oIdx) => (
                          <div key={oIdx} style={{ color: '#64748b', fontSize: '12px', marginLeft: '16px' }}>
                            • {opt}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Customer Note */}
                  {order.customerNote && (
                    <div style={{ backgroundColor: '#fffbeb', borderLeft: '3px solid #f59e0b', padding: '8px 12px', fontSize: '13px', color: '#92400e', marginBottom: '12px' }}>
                      <strong>Not:</strong> {order.customerNote}
                    </div>
                  )}

                  {/* Payment & Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                    <div>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: order.paymentMethod === 'cash_on_delivery' ? '#fef3c7' : '#e0e7ff',
                          color: order.paymentMethod === 'cash_on_delivery' ? '#b45309' : '#3730a3',
                        }}
                      >
                        {order.paymentMethod === 'cash_on_delivery' ? '💵 KAPIDA NAKİT' : '💳 ONLINE KART'}
                      </span>
                      {order.printStatus === 'printed' && (
                        <span style={{ fontSize: '12px', color: '#16a34a', marginLeft: '8px' }}>
                          ✓ Yazdırıldı (Printed)
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                      {formatKurus(order.totalKurus)}
                    </span>
                  </div>
                </div>

                {/* Staff Control Buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  {order.status === 'new' ? (
                    <>
                      <button
                        onClick={() => handleAcceptOrder(order.id)}
                        style={{
                          flex: 2,
                          padding: '12px',
                          background: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '15px',
                        }}
                      >
                        Kabul Et & Yazdır (Accept)
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'rejected')}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        Reddet (Reject)
                      </button>
                    </>
                  ) : order.status === 'accepted' ? (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'on_the_way')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      Yola Çıktı (On the Way)
                    </button>
                  ) : order.status === 'on_the_way' ? (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'delivered')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      Teslim Edildi (Delivered)
                    </button>
                  ) : (
                    <div style={{ flex: 1, textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      Tamamlandı (Completed)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
