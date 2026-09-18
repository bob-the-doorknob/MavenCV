/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_API_URL?: string;
    readonly EXPO_PUBLIC_REVENUECAT_IOS_KEY?: string;
    readonly EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?: string;
  }
}
