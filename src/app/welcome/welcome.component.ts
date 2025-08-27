import { Component, OnInit, inject } from '@angular/core'
import { AppSettingsService } from '../services/app-settings.service'
import { WalletService } from '../services/wallet.service'
import { environment } from '../../environments/environment'

@Component({
	selector: 'app-welcome',
	templateUrl: './welcome.component.html',
	styleUrls: ['./welcome.component.css']
})
export class WelcomeComponent implements OnInit {
	private walletService = inject(WalletService)
	settingsService = inject(AppSettingsService)


	donationAccount = environment.donationAddress
	wallet
	isConfigured

	constructor () {
		this.wallet = this.walletService.wallet
		this.isConfigured = this.walletService.isConfigured
	}

	ngOnInit () {

	}

}
