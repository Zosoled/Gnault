import { Component, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoDirective } from '@jsverse/transloco'
import { GnaultLogoElementComponent } from 'app/components'
import { WalletService } from 'app/services'

@Component({
	selector: 'app-welcome',
	templateUrl: './welcome.component.html',
	styleUrls: ['./welcome.component.css'],
	imports: [GnaultLogoElementComponent, RouterLink, TranslocoDirective],
})
export class WelcomeComponent {
	private svcWallet = inject(WalletService)

	get isConfigured () {
		return this.svcWallet.isConfigured()
	}
	get wallet () {
		return this.svcWallet.selectedWallet()
	}
}
