import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core'
import { createIcon } from 'assets/nanoidenticons.min.cjs'

@Component({
	selector: 'app-nano-identicon',
	templateUrl: './nano-identicon.component.html',
	styleUrls: ['./nano-identicon.component.css'],
	imports: [
		CommonModule
	]
})

export class NanoIdenticonComponent implements OnChanges, AfterViewInit {
	@Input() accountID: string
	@Input() scale: string
	@Input() settingIdenticonsStyle: string
	@ViewChild('canvasContainer') canvasContainer: ElementRef

	renderedIdenticon = ''
	imageLoadErrorOccurred = false

	ngOnChanges () {
		this.renderNanoidenticon()
	}

	ngAfterViewInit () {
		this.renderNanoidenticon()
	}

	renderNanoidenticon () {
		if (this.canvasContainer == null
			|| this.settingIdenticonsStyle !== 'nanoidenticons'
			|| this.renderedIdenticon === this.accountID
		) {
			return
		}
		this.renderedIdenticon = this.accountID
		const scale = parseInt(this.scale) * Math.max(1, window.devicePixelRatio)
		const canvas = createIcon({
			seed: this.accountID,
			scale,
		})
		const canvasContainerNative = this.canvasContainer.nativeElement
		while (canvasContainerNative.firstChild) {
			canvasContainerNative.removeChild(canvasContainerNative.lastChild)
		}
		canvasContainerNative.appendChild(canvas)
	}
}
