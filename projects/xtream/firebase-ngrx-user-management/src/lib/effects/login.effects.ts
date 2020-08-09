import {Injectable} from '@angular/core';
import {Actions, Effect, ofType} from '@ngrx/effects';
import {User} from '../models/auth.model';

import {AngularFireAuth} from '@angular/fire/auth';

import {catchError, exhaustMap, map, switchMap, take, tap} from 'rxjs/operators';
import * as userActions from '../actions/auth.actions';
import {from, Observable, of, zip} from 'rxjs';
import * as firebase from 'firebase/app';
import 'firebase/auth';
import {SetProviders} from '../actions/providers-management.actions';
import {Action} from '@ngrx/store';
import UserCredential = firebase.auth.UserCredential;

const PROVIDERS_MAP = {};
PROVIDERS_MAP[firebase.auth.FacebookAuthProvider.FACEBOOK_SIGN_IN_METHOD] = 'facebook';
PROVIDERS_MAP[firebase.auth.GoogleAuthProvider.GOOGLE_SIGN_IN_METHOD] = 'google';
PROVIDERS_MAP[firebase.auth.EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD] = 'password';
PROVIDERS_MAP[firebase.auth.PhoneAuthProvider.PHONE_SIGN_IN_METHOD] = 'phone';

@Injectable()
export class LoginEffects {

  @Effect()
  getUser: Observable<Action> = this.actions$.pipe(
    ofType<userActions.GetUser>(userActions.AuthActionTypes.GetUser),
    map((action: userActions.GetUser) => action.payload),
    exhaustMap(payload => this.afAuth.authState.pipe(
      take(1),
      switchMap(authData => {
        if (authData) {
          /// User logged in
          return zip(from(authData.getIdToken(true))).pipe(
            switchMap(res => {
              const providers = authData.providerData.reduce((prev, current) => {
                const key = PROVIDERS_MAP[current.providerId];
                if (key) {
                  prev[key] = true;
                }
                return prev;
              }, {});
              const user = new User(authData.uid, authData.displayName, authData.email, authData.phoneNumber, authData.photoURL, authData.emailVerified);
              return from([new SetProviders(providers), new userActions.Authenticated({user})]);
            })
          );
        } else {
          return of(new userActions.NotAuthenticated());
        }
      }))
    )
  );

  @Effect()
  googleLogin: Observable<Action> = this.actions$.pipe(
    ofType(userActions.AuthActionTypes.GoogleLogin),
    map((action: userActions.GoogleLogin) => action.payload),
    exhaustMap(payload => {
      return from(this.doGoogleLogin()).pipe(
        map(credential => {
          // successful login
          return new userActions.GetUser();
        }),
        catchError(error => of(new userActions.AuthError(error)))
      );
    })
  );

  @Effect()
  facebookLogin: Observable<Action> = this.actions$.pipe(
    ofType(userActions.AuthActionTypes.FacebookLogin),
    map((action: userActions.FacebookLogin) => action.payload),
    exhaustMap(payload => {
      return from(this.doFacebookLogin()).pipe(
        map(credential => {
          // successful login
          return new userActions.GetUser();
        }),
        catchError(error => of(new userActions.AuthError(error)))
      );
    })
  );

  @Effect()
  loginWithCredentials: Observable<Action> = this.actions$.pipe(
    ofType(userActions.AuthActionTypes.CredentialsLogin),
    map((action: userActions.CredentialsLogin) => {
      return {
        email: action.email,
        password: action.password,
        remember: (action.remember) ? action.remember : false
      };
    }),
    exhaustMap(credentials => {
      return from(this.doLoginWithCredentials(credentials)).pipe(
        map(p => {
          // successful login
          return new userActions.GetUser();
        }),
        catchError(error => of(new userActions.AuthError(error)))
      );
    })
  );

  @Effect()
  logout: Observable<Action> = this.actions$.pipe(
    ofType(userActions.AuthActionTypes.Logout),
    map((action: userActions.Logout) => action.payload),
    exhaustMap(payload => {
      return from(this.afAuth.auth.signOut());
    }),
    map(authData => {
      return new userActions.NotAuthenticated();
    })
  );

  @Effect()
  onDeleteNotVerifiedAccount$: Observable<any> = this.actions$.pipe(
    ofType<userActions.DeleteAccount>(userActions.AuthActionTypes.DeleteAccount),
    switchMap(() => {
      return from(this.afAuth.auth.currentUser.delete()).pipe(
        map(() => new userActions.DeleteAccountSuccess()),
        catchError(error => of(new userActions.DeleteAccountError(error)))
      );
    })
  );

  @Effect({dispatch: false})
  refreshToken$ = this.actions$.pipe(
    ofType(userActions.AuthActionTypes.RefreshToken),
    tap(action => this.afAuth.auth.currentUser.getIdToken(true))
  );

  constructor(private actions$: Actions,
              private afAuth: AngularFireAuth) {
  }

  private doFacebookLogin(): Promise<UserCredential> {
    const provider = new firebase.auth.FacebookAuthProvider();
    return this.afAuth.auth.signInWithPopup(provider);
  }

  private doGoogleLogin(): Promise<UserCredential> {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    return this.afAuth.auth.signInWithPopup(provider);
  }

  private doLoginWithCredentials(credentials: { email: string, password: string, remember?: boolean }): Promise<UserCredential> {
    if (credentials.remember) {
      return this.afAuth.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(() => {
        return this.afAuth.auth.signInWithEmailAndPassword(credentials.email, credentials.password);
      });
    } else {
      return this.afAuth.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(() => {
        return this.afAuth.auth.signInWithEmailAndPassword(credentials.email, credentials.password);
      });
    }
  }

}
