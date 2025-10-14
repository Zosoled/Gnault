import { Injectable, inject } from '@angular/core'
import { Router } from '@angular/router'
import { NotificationsService, UtilService } from 'app/services'

@Injectable({ providedIn: 'root' })
export class RemoteSignService {
	private router = inject(Router)
	private svcNotifcations = inject(NotificationsService)
	private svcUtil = inject(UtilService)

	navigateSignBlock (url) {
		if (!this.checkSignBlock(url.pathname)) {
			return this.svcNotifcations.sendWarning('Not a recognized format of an unsigned block.', { length: 5000 })
		}
		try {
			const data = JSON.parse(url.pathname)
			// Block to sign
			let paramsSign = {
				sign: 1,
				n_account: data.block.account,
				n_previous: data.block.previous,
				n_representative: data.block.representative,
				n_balance: data.block.balance,
				n_link: data.block.link,
			}
			// include previous block if exists
			if (data.previous) {
				paramsSign = {
					...paramsSign, ...{
						p_account: data.previous.account,
						p_previous: data.previous.previous,
						p_representative: data.previous.representative,
						p_balance: data.previous.balance,
						p_link: data.previous.link,
						p_signature: data.previous.signature,
					}
				}
			}
			// include multisig if exists
			if (data.participants) {
				paramsSign = {
					...paramsSign, ...{
						participants: data.participants,
					}
				}
			}
			this.router.navigate(['sign'], { queryParams: paramsSign })
		} catch (error) {
			this.svcNotifcations.sendWarning('Block sign data detected but not correct format.', { length: 5000 })
		}
	}

	navigateProcessBlock (url) {
		if (!this.checkSignBlock(url.pathname) || !this.checkProcessBlock(url.pathname)) {
			return this.svcNotifcations.sendWarning('Not a recognized format of a signed block.', { length: 5000 })
		}
		try {
			const data = JSON.parse(url.pathname)
			// Block to process
			let paramsProcess = {
				sign: 0,
				n_account: data.block.account,
				n_previous: data.block.previous,
				n_representative: data.block.representative,
				n_balance: data.block.balance,
				n_link: data.block.link,
				n_signature: data.block.signature,
				n_work: data.block.work,
			}
			// only include if it exist
			if (data.previous) {
				paramsProcess = {
					...paramsProcess, ...{
						p_account: data.previous.account,
						p_previous: data.previous.previous,
						p_representative: data.previous.representative,
						p_balance: data.previous.balance,
						p_link: data.previous.link,
					}
				}
			}
			this.router.navigate(['sign'], { queryParams: paramsProcess })
		} catch (error) {
			this.svcNotifcations.sendWarning('Block process data detected but not correct format.', { length: 5000 })
		}
	}

	checkSignBlock (stringdata: string) {
		try {
			const data = JSON.parse(stringdata)
			console.log(data)

			return (this.svcUtil.account.isValidAccount(data.block.account) &&
				(this.svcUtil.account.isValidAccount(data.previous?.account) ?? true) &&
				this.svcUtil.account.isValidAccount(data.block.representative) &&
				(this.svcUtil.account.isValidAccount(data.previous?.representative) ?? true) &&
				this.svcUtil.account.isValidAmount(data.block.balance) &&
				(this.svcUtil.account.isValidAmount(data.previous?.balance) ?? true) &&
				this.svcUtil.nano.isValidHash(data.block.previous) &&
				(this.svcUtil.nano.isValidHash(data.previous?.previous) ?? true) &&
				this.svcUtil.nano.isValidHash(data.block.link) &&
				(this.svcUtil.nano.isValidHash(data.previous?.link) ?? true) &&
				(this.svcUtil.nano.isValidSignature(data.previous?.signature) ?? true))
		} catch (error) {
			return false
		}
	}

	checkProcessBlock (stringdata: string) {
		try {
			const data = JSON.parse(stringdata)
			return (
				this.svcUtil.nano.isValidSignature(data.block.signature)
				&& (this.svcUtil.nano.isValidWork(data.block.work) ?? true)
			)
		} catch (error) {
			return false
		}
	}
}
