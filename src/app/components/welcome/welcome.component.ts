import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { AppSettingsService, WalletService } from 'app/services'
import { environment } from 'environments/environment'

@Component({
	selector: 'app-welcome',
	templateUrl: './welcome.component.html',
	styleUrls: ['./welcome.component.css'],
	imports: [
		CommonModule,
		RouterLink,
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
