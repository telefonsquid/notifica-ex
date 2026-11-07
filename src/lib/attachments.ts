import { resolve } from '$app/paths';
import type { Note } from '#lib/schemas.ts';

// Served through its own route, the files are protected in pocketbase
export function attachmentUrl(note: string, name: string): string {
    return resolve('/api/notes/[id]/attachments/[name]', { id: note, name })
}

// XHR, since fetch can't report how far an upload got | onprogress gets 0 to 1
export function uploadAttachment(note: string, file: File, onprogress: (share: number) => void): Promise<Note> {
    const form = new FormData()
    form.append('attachments', file)

    return new Promise((done, fail) => {
        const request = new XMLHttpRequest()
        request.open('POST', resolve('/api/notes/[id]/attachments', { id: note }))
        request.responseType = 'json'

        request.upload.onprogress = (event) => { if(event.lengthComputable) onprogress(event.loaded / event.total) }
        request.onerror = () => fail(new Error(`Could not upload ${file.name}.`))
        request.onload = () => {
            if(request.status >= 200 && request.status < 300) done(request.response)
            else fail(new Error(request.response?.message ?? `Could not upload ${file.name}.`))
        }

        request.send(form)
    })
}
