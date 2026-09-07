import { useRef } from "react";
import { Animated } from "react-native";

/**
 * تصغير طفيف عند الضغط.
 *
 * تغيير الشفافية وحده يبدو كأن الشاشة تومض؛ التصغير يبدو كأن العنصر
 * انضغط تحت الإصبع. الفرق صغير ويُحسّ.
 *
 * useNativeDriver يشغّل الحركة على خيط الواجهة، فتبقى ناعمة حتى وخيط
 * جافاسكربت مشغول بمعالجة ردّ الشبكة — وهو بالضبط ما يحدث عند الضغط على
 * بطاقة تفتح شاشة جديدة.
 */
export function usePressScale(pressedScale = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 45,
      // بلا ارتداد: الارتداد على شبكة من عشرين بطاقة يبدو رخيصاً
      bounciness: 0,
    }).start();

  return {
    scale,
    onPressIn: () => to(pressedScale),
    onPressOut: () => to(1),
  };
}
