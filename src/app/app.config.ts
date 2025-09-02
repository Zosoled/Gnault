import { provideHttpClient } from '@angular/common/http'
import { ApplicationConfig, isDevMode } from '@angular/core'
import {
	PreloadAllModules,
	provideRouter,
	withHashLocation,
	withPreloading
} from '@angular/router'
import { provideServiceWorker } from '@angular/service-worker'
import { provideTransloco } from '@jsverse/transloco'
import { routes } from 'app/routes'
import { TranslocoHttpLoader } from 'app/transloco-loader'

export const appConfig: ApplicationConfig = {
	providers: [
		provideHttpClient(),
		provideRouter(routes, withHashLocation(), withPreloading(PreloadAllModules)),
		provideServiceWorker('ngsw-worker.js'),
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
					useFallbackTranslation: true
				},
				reRenderOnLangChange: true,
				prodMode: !isDevMode()
			},
			loader: TranslocoHttpLoader
		})
	]
}
