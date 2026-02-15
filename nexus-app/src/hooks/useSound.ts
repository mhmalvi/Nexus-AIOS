
import { useCallback, useRef } from 'react';
import { useStore } from '../context/StoreContext';

type SoundType = 'hover' | 'click' | 'open' | 'close' | 'success' | 'error' | 'typing' | 'boot';

export function useSound() {
  const { ui } = useStore();
  const audioContext = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
  };

  const play = useCallback((type: SoundType) => {
    // Only play if not in focus mode (optional preference) or if specifically allowed
    if (!audioContext.current) initAudio();
    const ctx = audioContext.current!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'hover':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;

      case 'click':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;

      case 'open':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.2);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'success':
        // Arpeggio
        [440, 554, 659].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.05, now + i * 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.2);
            o.start(now + i * 0.05);
            o.stop(now + i * 0.05 + 0.2);
        });
        break;

      case 'error':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
        
      case 'boot':
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const g1 = ctx.createGain();
        
        o1.connect(g1);
        o2.connect(g1);
        g1.connect(ctx.destination);
        
        o1.type = 'sawtooth';
        o2.type = 'square';
        
        o1.frequency.setValueAtTime(50, now);
        o1.frequency.exponentialRampToValueAtTime(100, now + 2);
        
        o2.frequency.setValueAtTime(52, now); // slight detune
        o2.frequency.exponentialRampToValueAtTime(104, now + 2);
        
        g1.gain.setValueAtTime(0, now);
        g1.gain.linearRampToValueAtTime(0.1, now + 0.5);
        g1.gain.linearRampToValueAtTime(0, now + 2.5);
        
        o1.start(now);
        o2.start(now);
        o1.stop(now + 3);
        o2.stop(now + 3);
        break;
    }
  }, []);

  return { play };
}
