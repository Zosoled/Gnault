import { provideHttpClient } from '@angular/common/http'
import { ApplicationConfig, inject, isDevMode, provideAppInitializer } from '@angular/core'
import {
	PreloadAllModules,
	provideRouter,
	withHashLocation,
	withPreloading
} from '@angular/router'
import { provideServiceWorker } from '@angular/service-worker'
import { provideTransloco, TranslocoService } from '@jsverse/transloco'
import { routes } from 'app/routes'
import { TranslocoHttpLoader } from 'app/transloco-loader'
import { firstValueFrom } from 'rxjs'

export const appConfig: ApplicationConfig = {
	providers: [
		provideAppInitializer(() => {
			const svcTransloco = inject(TranslocoService)
			svcTransloco.setActiveLang('en')
			return firstValueFrom(svcTransloco.load('en'))
		}),
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
