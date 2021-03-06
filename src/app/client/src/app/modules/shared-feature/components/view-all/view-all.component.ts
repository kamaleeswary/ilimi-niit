import { PublicPlayerService } from '@sunbird/public';
import { Component, OnInit, OnDestroy} from '@angular/core';
import { combineLatest, Subject } from 'rxjs';
import {
  ServerResponse, PaginationService, ResourceService, ConfigService, ToasterService, INoResultMessage,
  ILoaderMessage, UtilService, ICard, BrowserCacheTtlService
} from '@sunbird/shared';
import { SearchService, CoursesService, ISort, PlayerService, OrgDetailsService, UserService, FormService } from '@sunbird/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IPagination } from '@sunbird/announcement';
import * as _ from 'lodash';
import { takeUntil, first, mergeMap, map, tap, filter } from 'rxjs/operators';
import { IInteractEventObject, IInteractEventEdata, IImpressionEventInput } from '@sunbird/telemetry';
import { CacheService } from 'ng2-cache-service';
@Component({
  selector: 'app-view-all',
  templateUrl: './view-all.component.html',
  styleUrls: ['./view-all.component.css']
})
export class ViewAllComponent implements OnInit, OnDestroy {
  /**
	 * telemetryImpression
	*/
  public telemetryImpression: IImpressionEventInput;
  public closeIntractEdata: IInteractEventEdata;
  public cardIntractEdata: IInteractEventEdata;
  public sortIntractEdata: IInteractEventEdata;
  /**
   * To call searchService which helps to use list of courses
   */
  private searchService: SearchService;
  /**
  * To call resource service which helps to use language constant
  */
  private resourceService: ResourceService;
  /**
   * To get url, app configs
   */
  public configService: ConfigService;
  /**
  * To show toaster(error, success etc) after any API calls
  */
  private toasterService: ToasterService;
  /**
   * Contains list of published course(s) of logged-in user
   */
  searchList: Array<ICard> = [];
  /**
   * To navigate to other pages
   */
  private router: Router;
  /**
  * To send activatedRoute.snapshot to router navigation
  * service for redirection to parent component
  */
  private activatedRoute: ActivatedRoute;
  /**
   * For showing pagination on inbox list
   */
  private paginationService: PaginationService;
  /**
  * To get enrolled courses details.
  */
  coursesService: CoursesService;
  /**
  * Refrence of UserService
  */
   private userService: UserService;
  /**
    * To show / hide no result message when no result found
   */
  noResult = false;
  /**
   * no result  message
  */
  noResultMessage: INoResultMessage;
  /**
    * totalCount of the list
  */
  totalCount: Number;
  /**
   * Current page number of inbox list
   */
  pageNumber: number;
  /**
	 * Contains page limit of outbox list
	 */
  pageLimit: number;
  /**
   * This variable hepls to show and hide page loader.
   * It is kept true by default as at first when we comes
   * to a page the loader should be displayed before showing
   * any data
   */
  showLoader = true;
  /**
  *baseUrl;
  */
  public baseUrl: string;
  /**
     * loader message
    */
  loaderMessage: ILoaderMessage;
  /**
   * Contains returned object of the pagination service
   * which is needed to show the pagination on inbox view
   */
  pager: IPagination;
  /**
   *url value
   */
  queryParams: any;
  /**
 *search filters
 */
  filters: any;
  hashTagId: string;
  formAction: string;
  showFilter = false;
  /**
  * To show / hide login popup on click of content
  */
  showLoginModal = false;
 /**
  /**
   * contains the search filter type
   */
  public frameworkData: object;
  public filterType: string;
  public frameWorkName: string;
  public sortingOptions: Array<ISort>;
  public closeUrl: string;
  public sectionName: string;
  public unsubscribe = new Subject<void>();
  constructor(searchService: SearchService, router: Router, private playerService: PlayerService, private formService: FormService,
    activatedRoute: ActivatedRoute, paginationService: PaginationService, private _cacheService: CacheService,
    resourceService: ResourceService, toasterService: ToasterService, private publicPlayerService: PublicPlayerService,
    configService: ConfigService, coursesService: CoursesService, public utilService: UtilService,
    private orgDetailsService: OrgDetailsService, userService: UserService,  private browserCacheTtlService: BrowserCacheTtlService) {
    this.searchService = searchService;
    this.router = router;
    this.activatedRoute = activatedRoute;
    this.paginationService = paginationService;
    this.resourceService = resourceService;
    this.toasterService = toasterService;
    this.configService = configService;
    this.coursesService = coursesService;
    this.userService = userService;
    this.router.onSameUrlNavigation = 'reload';
    this.sortingOptions = this.configService.dropDownConfig.FILTER.RESOURCES.sortingOptions;
  }

  ngOnInit() {
    if (!this.userService.loggedIn) {
      this.getChannelId();
    } else  {
      this.showFilter = true;
      this.userService.userData$.subscribe(userData => {
        if (userData && !userData.err) {
            this.frameworkData = _.get(userData.userProfile, 'framework');
        }
      });
    }
    this.formAction = _.get(this.activatedRoute.snapshot, 'data.formAction');
    this.filterType = _.get(this.activatedRoute.snapshot, 'data.filterType');
    this.pageLimit = this.configService.appConfig.ViewAll.PAGE_LIMIT;
    combineLatest(this.activatedRoute.params, this.activatedRoute.queryParams).pipe(
      map(results => ({ params: results[0], queryParams: results[1] })),
      filter( res => this.pageNumber !== Number(res.params.pageNumber) || !_.isEqual(this.queryParams , res.queryParams)),
      tap(res => {
        this.queryParams = res.queryParams;
        const route = this.router.url.split('/view-all');
        this.closeUrl = '/' + route[0].toString();
        this.sectionName = res.params.section.replace(/\-/g, ' ');
        this.pageNumber = Number(res.params.pageNumber);
      }),
      mergeMap((data) => {
        this.getframeWorkData();
        this.manipulateQueryParam(data.queryParams);
        this.setTelemetryImpressionData();
        this.setInteractEventData();
        return this.getContentList(data);
      }),
      takeUntil(this.unsubscribe)
    ).subscribe((response: any) => {
      this.showLoader = false;
      if (response.contentData.result.count && response.contentData.result.content) {
        this.noResult = false;
        this.totalCount = response.contentData.result.count;
        this.pager = this.paginationService.getPager(response.contentData.result.count, this.pageNumber, this.pageLimit);
        this.searchList = this.formatSearchresults(response);
      } else {
        this.noResult = true;
        this.noResultMessage = {
          'message': this.resourceService.messages.stmsg.m0007,
          'messageText': this.resourceService.messages.stmsg.m0006
        };
      }
    }, (error) => {
      this.showLoader = false;
      this.noResult = true;
      this.noResultMessage = {
        'messageText': this.resourceService.messages.fmsg.m0077
      };
      this.toasterService.error(this.resourceService.messages.fmsg.m0051);
    });
  }

  setTelemetryImpressionData() {
    this.telemetryImpression = {
      context: {
        env: _.get(this.activatedRoute.snapshot, 'data.telemetry.env')
      },
      edata: {
        type: _.get(this.activatedRoute.snapshot, 'data.telemetry.type'),
        pageid: _.get(this.activatedRoute.snapshot, 'data.telemetry.pageid'),
        uri: this.router.url,
        subtype: _.get(this.activatedRoute.snapshot, 'data.telemetry.subtype')
      }
    };
  }
  setInteractEventData() {
    this.closeIntractEdata = {
      id: 'close',
      type: 'click',
      pageid: _.get(this.activatedRoute.snapshot, 'data.telemetry.pageid'),
    };
    this.cardIntractEdata = {
      id: 'content-card',
      type: 'click',
      pageid: _.get(this.activatedRoute.snapshot, 'data.telemetry.pageid'),
    };
    this.sortIntractEdata = {
      id: 'sort',
      type: 'click',
      pageid: _.get(this.activatedRoute.snapshot, 'data.telemetry.pageid'),
    };
  }
  private manipulateQueryParam(results) {
    this.filters = {};
    const queryFilters = _.omit(results, ['key', 'softConstraintsFilter', 'appliedFilters',
    'sort_by', 'sortType', 'defaultSortBy', 'exists', 'dynamic']);
    if (!_.isEmpty(queryFilters)) {
      _.forOwn(queryFilters, (queryValue, queryKey) => {
        this.filters[queryKey] = queryValue;
      });
    }
    if (results && results.dynamic) {
      const fields = JSON.parse(results.dynamic);
      _.forIn(fields, (value, key) => {
        this.filters[key] = value;
      });
    }
  }

  private getContentList(request) {
    const softConstraintData = {
      filters: _.get(request.queryParams, 'softConstraintsFilter') ? JSON.parse(request.queryParams.softConstraintsFilter) : {},
      softConstraints: _.get(this.activatedRoute.snapshot, 'data.softConstraints'),
      mode: 'soft'
    };
    let manipulatedData = {};
    if (_.get(this.activatedRoute.snapshot, 'data.applyMode')) {
       manipulatedData = this.utilService.manipulateSoftConstraint( _.get(this.queryParams, 'appliedFilters'),
      softConstraintData, this.frameworkData);
    }
    const requestParams = {
      filters: _.get(this.queryParams, 'appliedFilters') ? this.filters :  {..._.get(manipulatedData, 'filters'), ...this.filters},
      limit: this.pageLimit,
      pageNumber: Number(request.params.pageNumber),
      exists: request.queryParams.exists,
      sort_by: request.queryParams.sortType ?
        { [request.queryParams.sort_by]: request.queryParams.sortType } : JSON.parse(request.queryParams.defaultSortBy),
      mode: _.get(manipulatedData, 'mode'),
      params : this.configService.appConfig.ViewAll.contentApiQueryParams
    };
    if (_.get(manipulatedData, 'filters')) {
      requestParams['softConstraints'] = _.get(manipulatedData, 'softConstraints');
    }
    if (_.get(this.activatedRoute.snapshot, 'data.baseUrl') === 'learn') {
      return combineLatest(
        this.searchService.contentSearch(requestParams),
        this.coursesService.enrolledCourseData$).pipe(map(data => ({contentData: data[0] , enrolledCourseData: data[1] })));
    } else {
      return this.searchService.contentSearch(requestParams).pipe(map(data => ({contentData: data })));
    }
  }

  private formatSearchresults(response) {
    const enrolledCoursesId = [];
    _.forEach(_.get(response, 'enrolledCourseData.enrolledCourses'), (value, index) => {
      enrolledCoursesId[index] = _.get(response.enrolledCourseData.enrolledCourses[index], 'courseId');
    });
    _.forEach(response.contentData.result.content, (value, index) => {
      if (_.get(response, 'enrolledCourseData.enrolledCourses') && _.get(response, 'enrolledCourseData.enrolledCourses.length') > 0) {
        if (_.indexOf(enrolledCoursesId, response.contentData.result.content[index].identifier) !== -1) {
          const constantData = this.configService.appConfig.ViewAll.enrolledCourses.constantData;
          const metaData = { metaData: this.configService.appConfig.ViewAll.enrolledCourses.metaData };
          const dynamicFields = {};
          const enrolledCourses = _.find(response.enrolledCourseData.enrolledCourses,
            ['courseId', response.contentData.result.content[index].identifier]);
          response.contentData.result.content[index] = this.utilService.processContent(enrolledCourses,
            constantData, dynamicFields, metaData);
        } else {
          const constantData = this.configService.appConfig.ViewAll.otherCourses.constantData;
          const metaData = this.configService.appConfig.ViewAll.metaData;
          const dynamicFields = this.configService.appConfig.ViewAll.dynamicFields;
          response.contentData.result.content[index] = this.utilService.processContent(response.contentData.result.content[index],
            constantData, dynamicFields, metaData);
        }
      } else {
        const constantData = this.configService.appConfig.ViewAll.otherCourses.constantData;
        const metaData = this.configService.appConfig.ViewAll.metaData;
        const dynamicFields = this.configService.appConfig.ViewAll.dynamicFields;
        response.contentData.result.content[index] = this.utilService.processContent(response.contentData.result.content[index],
          constantData, dynamicFields, metaData);
      }
    });
    return response.contentData.result.content;
  }

  navigateToPage(page: number): undefined | void {
    const route = this.router.url.split('?');
    const url = route[0].substring(0, route[0].lastIndexOf('/'));
    if (page < 1 || page > this.pager.totalPages) {
      return;
    }
      this.router.navigate([url, page], {
        queryParams: this.queryParams,
        relativeTo: this.activatedRoute
      });
  }

  playContent(event) {
    if (!this.userService.loggedIn && event.data.contentType === 'Course') {
      this.showLoginModal = true;
      this.baseUrl = '/' + 'learn' + '/' + 'course' + '/' + event.data.metaData.identifier;
    } else {
      const url = this.router.url.split('/');
      if (url[1] === 'learn' || url[1] === 'resources') {
        if (event.data.metaData.batchId) {
          event.data.metaData.mimeType = 'application/vnd.ekstep.content-collection';
          event.data.metaData.contentType = 'Course';
        }
        this.playerService.playContent(event.data.metaData);
      } else {
        this.publicPlayerService.playContent(event);
      }
    }
  }

  getChannelId() {
    this.orgDetailsService.getOrgDetails()
      .subscribe(
        (apiResponse: any) => {
          this.hashTagId = apiResponse.hashTagId;
          this.showFilter = true;
        },
        err => {

        }
      );
  }
  private getframeWorkData() {
    if (_.get(this.activatedRoute.snapshot, 'data.frameworkName')) {
      const framework = this._cacheService.get('framework' + 'search');
      if (framework) {
        this.frameWorkName = framework;
      } else {
        const formServiceInputParams = {
          formType: 'framework',
          formAction: 'search',
          contentType: 'framework-code',
        };
        this.formService.getFormConfig(formServiceInputParams).subscribe(
          (data: ServerResponse) => {
            this.frameWorkName = _.find(data, 'framework').framework;
            this._cacheService.set('framework' + 'search', this.frameWorkName ,
              {maxAge: this.browserCacheTtlService.browserCacheTtl});
          },
          (err: ServerResponse) => {
          this.toasterService.error(this.resourceService.messages.emsg.m0005);
          }
        );
      }
    }
  }
  ngOnDestroy() {
    this.unsubscribe.next();
    this.unsubscribe.complete();
  }
  closeModal() {
    this.showLoginModal = false;
  }
}
