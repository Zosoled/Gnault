import { Component, OnInit, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { GnaultLogoElementComponent } from 'app/components'
import { AppSettingsService, WalletService } from 'app/services'
import { environment } from 'environments/environment'

@Component({
	selector: 'app-welcome',
	templateUrl: './welcome.component.html',
	styleUrls: ['./welcome.component.css'],
	imports: [GnaultLogoElementComponent, RouterLink, TranslocoPipe],
})
export class WelcomeComponent implements OnInit {
	private walletService = inject(WalletService)
	settingsService = inject(AppSettingsService)

	donationAccount = environment.donationAddress
	wallet = this.walletService.wallet
	isConfigured = this.walletService.isConfigured

	ngOnInit() {}
}
