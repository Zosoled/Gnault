import { HttpClient } from '@angular/common/http'
import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { AppSettingsService } from './app-settings.service'
import { NotificationsService } from './notification.service'

@Injectable({ providedIn: 'root' })
export class PriceService {
	private http = inject(HttpClient)
	private svcAppSettings = inject(AppSettingsService)
	private svcNotifications = inject(NotificationsService)

	private age = computed(() => Date.now() - this.lastUpdated())
	private apiUrl: string = `https://api.coingecko.com/api/v3/coins/nano?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
	private lastUpdated = signal(0)
	private storeKey: 'Gnault-Price' = 'Gnault-Price'

	currencies: Signal<string[]> = computed(() => {
		return Object.keys(this.prices()).map(price => price.toUpperCase())
	})
	lastPrice: Signal<number> = computed(() => {
		const displayCurrency = this.svcAppSettings.settings().displayCurrency.toLowerCase()
		const prices = this.prices()
		return prices[displayCurrency] ?? 0
	})
	oneNano: bigint = 10n ** 30n
	prices: WritableSignal<{ [currency: string]: number }> = signal(null)

	constructor () {
		this.loadPrice()
		if (this.lastUpdated() === 0) {
			this.fetchPrice()
		} else {
			setTimeout(() => this.fetchPrice(), 90_000)
		}
	}

	/**
	 * Updates the current market prices for Nano. CoinGecko updates prices
	 * roughly every 60 seconds, but this runs every 90 seconds to avoid hitting
	 * API limits.
	 */
	private async fetchPrice (): Promise<void> {
		try {
			if (this.age() > 60_000) {
				const request = this.http.get(`${this.apiUrl}`)
				const response: any = await firstValueFrom(request)
				const lastUpdated = new Date(response.market_data.last_updated).getTime()
				if (lastUpdated > this.lastUpdated()) {
					const { current_price } = response.market_data
					this.prices.set(current_price)
					this.lastUpdated.set(lastUpdated)
					this.savePrice()
				}
			}
			setTimeout(() => this.fetchPrice(), 90_000)
		} catch (err) {
			this.svcNotifications.sendWarning(
				'Failed to get latest nano prices. Disable ad blockers and reload to try again.',
				{ length: 0, identifier: `price-adblock` }
			)
		}
	}

	private loadPrice (): void {
		const item = localStorage.getItem(this.storeKey)
		if (item) {
			const data = JSON.parse(item)
			this.lastUpdated.set(data.lastUpdated)
			this.prices.set(data.prices)
		}
	}

	private savePrice (): void {
		const data = { lastUpdated: this.lastUpdated(), prices: this.prices() }
		localStorage.setItem(this.storeKey, JSON.stringify(data))
	}
}
