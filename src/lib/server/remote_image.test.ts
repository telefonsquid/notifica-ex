import { describe, expect, test } from 'bun:test';
import { isPrivate } from './remote_image.ts';

describe('addresses the image download refuses', () => {

    test('private and local IPv4 ranges', () => {
        for(const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0'])
            expect(isPrivate(address)).toBe(true)
    })

    test('local IPv6, also when wrapped around an IPv4', () => {
        for(const address of ['::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])
            expect(isPrivate(address)).toBe(true)
    })

    test('public addresses pass', () => {
        for(const address of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])
            expect(isPrivate(address)).toBe(false)
    })

})
