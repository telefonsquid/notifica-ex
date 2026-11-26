// The released Android app, proof for passkeys that it may act for a server
export const ANDROID_PACKAGE = 'ex.notifica.app'

// SHA256 of the release signing certificate
export const ANDROID_CERTIFICATE = '45d828c9b217640a9417ab03c848364cd3e6aa897b4ee601b709949db383e67f'

// How Android names the app in place of a web origin
export const ANDROID_ORIGIN = `android:apk-key-hash:${Buffer.from(ANDROID_CERTIFICATE, 'hex').toString('base64url')}`
