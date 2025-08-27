import { BehaviorSubject } from 'rxjs'

export class ModalService {
	showAccount$ = new BehaviorSubject(null)
	showAccount (account) {
		this.showAccount$.next(account)
	}
}
