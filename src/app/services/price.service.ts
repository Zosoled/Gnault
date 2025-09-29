import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class PriceService {
	private http: HttpClient = inject(HttpClient)

	static apiUrl: string = `https://api.coingecko.com/api/v3/coins/nano?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
	static lastUpdate: number = 0
	static storeKey: 'Gnault-Price' = 'Gnault-Price'

	currencies: string[] = []
	lastPrice = signal(0)
	oneNano = 10n ** 30n
	prices: Map<string, number>

	constructor () {
		this.loadPrice()
		if (PriceService.lastUpdate === 0) {
			this.fetchPrice()
		}
	}

	/**
	 * Gets the current market prices and optionally returns the exchange rate for
	 * a given currency. CoinGecko updates prices roughly every 60 seconds.
	 *
	 * @param {string} [currency] Code for requested exchange rate currency
	 * @returns Market price for requested currency
	 */
	async fetchPrice (currency?: string): Promise<void> {
		currency = currency?.toLowerCase()
		if (PriceService.lastUpdate < Date.now() - 60000) {
			const request = this.http.get(`${PriceService.apiUrl}`)
			const response: any = await firstValueFrom(request)
			const lastUpdated = new Date(response.market_data.last_updated).getTime()
			if (lastUpdated > PriceService.lastUpdate) {
				this.prices = response.market_data.current_price
				this.currencies = Object.keys(this.prices)
				PriceService.lastUpdate = lastUpdated
				this.savePrice()
			}
		}
		this.lastPrice.set(this.prices[currency])
	}

	async loadPrice (): Promise<void> {
		const priceData = localStorage.getItem(PriceService.storeKey)
		if (priceData) {
			Object.assign(this, JSON.parse(priceData))
		}
	}

	savePrice (): void {
		PriceService.lastUpdate = Date.now()
		localStorage.setItem(PriceService.storeKey, JSON.stringify({ prices: this.prices }))
	}
}
