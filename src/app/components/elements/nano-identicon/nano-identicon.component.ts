import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core'
import { createIcon } from 'assets/nanoidenticons.min.cjs'

@Component({
	selector: 'app-nano-identicon',
	templateUrl: './nano-identicon.component.html',
	styleUrls: ['./nano-identicon.component.css'],
	imports: [],
})
export class NanoIdenticonComponent implements OnChanges, AfterViewInit {
	@Input() address: string
	@Input() scale: string
	@Input() settingIdenticonsStyle: string
	@ViewChild('canvasContainer') canvasContainer: ElementRef

	renderedIdenticon = ''
	imageLoadErrorOccurred = false

	ngOnChanges() {
		this.renderNanoidenticon()
	}

	ngAfterViewInit() {
		this.renderNanoidenticon()
	}

	renderNanoidenticon() {
		if (
			this.canvasContainer == null ||
			this.settingIdenticonsStyle !== 'nanoidenticons' ||
			this.renderedIdenticon === this.address
		) {
			return
		}
		this.renderedIdenticon = this.address
		const scale = parseInt(this.scale) * Math.max(1, window.devicePixelRatio)
		const canvas = createIcon({
			seed: this.address,
			scale,
		})
		const canvasContainerNative = this.canvasContainer.nativeElement
		while (canvasContainerNative.firstChild) {
			canvasContainerNative.removeChild(canvasContainerNative.lastChild)
		}
		canvasContainerNative.appendChild(canvas)
	}
}
