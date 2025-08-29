import { Injectable, inject } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { QrModalComponent, QRType } from 'app/components'

@Injectable({
	providedIn: 'root'
})

export class QrModalService {
	private modalService = inject(NgbModal)

	/** Will return a promise that will only resolve if the type matches the QR string read and is valid
	 *
	 * @param reference Unique reference ID for example a text input
	 * @param type String type to match in QR
	 */
	openQR (reference: string, type: QRType): Promise<any> {
		const response = this.getDeferredPromise()
		const modalRef = this.modalService.open(QrModalComponent, { windowClass: 'scanner-modal' })
		modalRef.componentInstance.reference = reference
		modalRef.componentInstance.type = type
		modalRef.result
			.then(data => response.resolve(data))
			.catch(err => response.reject())
		return response.promise
	}

	// Helper for returning a deferred promise that we can resolve when QR is ready
	private getDeferredPromise () {
		const defer = {
			promise: null,
			resolve: null,
			reject: null,
		}
		defer.promise = new Promise((resolve, reject) => {
			defer.resolve = resolve
			defer.reject = reject
		})
		return defer
	}
}
