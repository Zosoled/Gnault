import { provideHttpClient } from '@angular/common/http'
import { enableProdMode, isDevMode } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { PreloadAllModules, provideRouter, withHashLocation, withPreloading } from '@angular/router'
import { provideTransloco } from '@jsverse/transloco'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { AppComponent } from 'app/app.component'
import { routes } from 'app/routes'
import { TranslocoHttpLoader } from 'app/transloco-loader'
import { NanoAccountIdComponent } from 'app/components/helpers'
import { environment } from 'environments/environment'

// Providers
import { AddressBookService } from './app/services/address-book.service'
import { ApiService } from './app/services/api.service'
import { AppSettingsService } from './app/services/app-settings.service'
import { DeeplinkService } from './app/services/deeplink.service'
import { DesktopService } from './app/services/desktop.service'
import { LedgerService } from './app/services/ledger.service'
import { ModalService } from './app/services/modal.service'
import { MusigService } from './app/services/musig.service'
import { NanoBlockService } from './app/services/nano-block.service'
import { NinjaService } from './app/services/ninja.service'
import { NodeService } from './app/services/node.service'
import { NotificationService } from './app/services/notification.service'
import { PowService } from './app/services/pow.service'
import { PriceService } from './app/services/price.service'
import { QrModalService } from './app/services/qr-modal.service'
import { RemoteSignService } from './app/services/remote-sign.service'
import { RepresentativeService } from './app/services/representative.service'
import { UtilService } from './app/services/util.service'
import { WalletService } from './app/services/wallet.service'
import { WebsocketService } from './app/services/websocket.service'
import { WorkPoolService } from './app/services/work-pool.service'
import { provideServiceWorker } from '@angular/service-worker'

if (environment.production) {
	enableProdMode()
}

bootstrapApplication(AppComponent, {
	providers: [
		AddressBookService,
		ApiService,
		AppSettingsService,
		DeeplinkService,
		DesktopService,
		LedgerService,
		ModalService,
		MusigService,
		NanoBlockService,
		NanoAccountIdComponent,
		NgbActiveModal,
		NinjaService,
		NodeService,
		NotificationService,
		PowService,
		PriceService,
		QrModalService,
		RemoteSignService,
		RepresentativeService,
		UtilService,
		WalletService,
		WebsocketService,
		WorkPoolService,
		provideHttpClient(),
		provideRouter(routes, withHashLocation(), withPreloading(PreloadAllModules)),
		provideServiceWorker('ngsw-worker.js', {
			enabled: !isDevMode
		}),
		provideTransloco({
			config: {
				availableLangs: [
					{ id: 'en', label: 'English' },
					{ id: 'de', label: 'Deutsch' },
					{ id: 'es', label: 'Español' },
					{ id: 'fr', label: 'Français' },
					{ id: 'pt-br', label: 'Português (Brasil)' }
				],
				defaultLang: 'en',
				fallbackLang: 'en',
				missingHandler: {
					// It will use the first language set in the `fallbackLang` property
					useFallbackTranslation: true
				},
				reRenderOnLangChange: true,
				prodMode: !isDevMode
			},
			loader: TranslocoHttpLoader
		})
	]
})
	.catch(err => console.error(err))
