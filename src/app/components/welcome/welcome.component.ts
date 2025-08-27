import { Component, OnInit, inject } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { AppSettingsService } from '../../services/app-settings.service'
import { WalletService } from '../../services/wallet.service'
import { environment } from '../../../environments/environment'

@Component({
	selector: 'app-welcome',
	templateUrl: './welcome.component.html',
	styleUrls: ['./welcome.component.css'],
	imports: [
		TranslocoPipe
	]
})

export class WelcomeComponent implements OnInit {
	private walletService = inject(WalletService)
	settingsService = inject(AppSettingsService)

	donationAccount = environment.donationAddress
	wallet = this.walletService.wallet
	isConfigured = this.walletService.isConfigured

	ngOnInit () { }
}
