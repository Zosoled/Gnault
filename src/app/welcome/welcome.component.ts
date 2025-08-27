import { Component, OnInit, inject } from '@angular/core'
import { environment } from 'environments/environment'
import { WalletService } from '../services/wallet.service'
import { AppSettingsService } from '../services/app-settings.service'

@Component({
	selector: 'app-welcome',
	templateUrl: './welcome.component.html',
	styleUrls: ['./welcome.component.css']
})
export class WelcomeComponent implements OnInit {
	private walletService = inject(WalletService);
	settingsService = inject(AppSettingsService);


	donationAccount = environment.donationAddress;

	wallet = this.walletService.wallet;
	isConfigured = this.walletService.isConfigured;

	ngOnInit () {

	}

}
