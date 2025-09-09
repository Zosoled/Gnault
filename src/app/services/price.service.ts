import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { BehaviorSubject, firstValueFrom } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class PriceService {
	private http: HttpClient = inject(HttpClient)

	static apiUrl: string = `https://api.coingecko.com/api/v3/coins/nano?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
	static lastUpdate: number = 0
	static storeKey: 'Gnault-Price' = 'Gnault-Price'

	#lastPrice$: BehaviorSubject<number> = new BehaviorSubject(1)
	get lastPrice$(): BehaviorSubject<number> {
		return this.#lastPrice$
	}

	currencies: string[] = []
	lastPrice: number = 0
	prices: Map<string, number>

	constructor() {
		this.loadPrice()
	}

	/**
	 * Gets the current market prices and optionally returns the exchange rate for
	 * a given currency. CoinGecko updates prices roughly every 60 seconds.
	 *
	 * @param {string} [currency] Code for requested exchange rate currency
	 * @returns Market price for requested currency
	 */
	async fetchPrice(currency?: string): Promise<number> {
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
		this.lastPrice = this.prices[currency]
		this.lastPrice$.next(this.lastPrice)
		return this.lastPrice
	}

	async loadPrice(): Promise<void> {
		const priceData = localStorage.getItem(PriceService.storeKey)
		if (priceData) {
			Object.assign(this, JSON.parse(priceData))
		}
	}

	savePrice(): void {
		PriceService.lastUpdate = Date.now()
		localStorage.setItem(PriceService.storeKey, JSON.stringify({ prices: this.prices }))
	}
}
