import { ANDROID_CERTIFICATE, ANDROID_PACKAGE } from '#lib/server/android_app.ts';
import { json } from '@sveltejs/kit';

// Tells Android that the app may use this server's passkeys
export function GET() {
    return json([{
        relation: ['delegate_permission/common.get_login_creds'],
        target: {
            namespace: 'android_app',
            package_name: ANDROID_PACKAGE,
            sha256_cert_fingerprints: [ANDROID_CERTIFICATE.toUpperCase().match(/../g)!.join(':')]
        }
    }])
}
