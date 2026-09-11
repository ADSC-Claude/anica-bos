/**
 * The light build of lottie-web, which ships no types beside it.
 *
 * The full player has `lottie.d.ts`; the ESM light build — the only one that
 * reaches a guest, and only on a page that carries an animation — is a bare
 * .min.js. This is the slice of its surface the app actually uses, which is
 * four methods and one call.
 */
declare module 'lottie-web/build/player/esm/lottie_light.min.js' {
  export type LottieAnimation = {
    play(): void;
    pause(): void;
    destroy(): void;
    setSpeed(speed: number): void;
    goToAndStop(value: number, isFrame?: boolean): void;
    addEventListener(name: string, handler: () => void): void;
    totalFrames: number;
  };
  export type LottieLoad = {
    container: Element;
    renderer: 'svg';
    loop: boolean;
    autoplay: boolean;
    path?: string;
    animationData?: unknown;
    rendererSettings?: { preserveAspectRatio?: string; progressiveLoad?: boolean };
  };
  const lottie: {
    loadAnimation(options: LottieLoad): LottieAnimation;
    setQuality(quality: 'low' | 'medium' | 'high' | number): void;
  };
  export default lottie;
}
