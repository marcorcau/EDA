import { DateUtils } from './../../../services/utils/date-utils.service';
import { Component, OnInit, ViewChild, ViewChildren, QueryList, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { GridsterComponent, IGridsterOptions, IGridsterDraggableOptions } from 'angular2gridster';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Dashboard, EdaPanel, EdaTitlePanel, EdaPanelType, InjectEdaPanel } from '@eda/models/model.index';
import { EdaDialogController, EdaDialogCloseEvent, EdaDatePickerComponent } from '@eda/shared/components/shared-components.index';
import { DashboardService, AlertService, FileUtiles, QueryBuilderService, GroupService, IGroup, SpinnerService, UserService, StyleProviderService, DashboardStyles } from '@eda/services/service.index';
import { EdaBlankPanelComponent } from '@eda/components/eda-panels/eda-blank-panel/eda-blank-panel.component';
import { SelectItem } from 'primeng/api';
import { Subscription } from 'rxjs';
import domtoimage from 'dom-to-image';
import Swal from 'sweetalert2';
import jspdf from 'jspdf';
import * as _ from 'lodash';
import { EdaDatePickerConfig } from '@eda/shared/components/eda-date-picker/datePickerConfig';


@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
    //@HostListener('window:resize', ['$event'])

    // Gridster ViewChild
    @ViewChild(GridsterComponent, { static: false }) gridster: GridsterComponent;
    @ViewChildren(EdaBlankPanelComponent) edaPanels: QueryList<EdaBlankPanelComponent>;
    private edaPanelsSubscription: Subscription;

    @ViewChildren(EdaDatePickerComponent) datePickers: QueryList<EdaDatePickerComponent>;
    private datePickersSubscription: Subscription;
    // Dashboard Page Variables
    public id: string;
    public title: string = $localize`:@@loading:Cargando informe...`;
    public form: FormGroup;
    public titleClick: boolean;
    public dataSource: any;
    public dashboard: Dashboard;
    public visibleTypes: SelectItem[] = [];
    public filterController: EdaDialogController;
    public emailController: EdaDialogController;
    public saveasController: EdaDialogController;
    public editStylesController: EdaDialogController;
    public applyToAllfilter: { present: boolean, refferenceTable: string, id: string };
    public grups: IGroup[] = [];
    public toLitle: boolean = false;
    public toMedium: boolean = false;
    public datasourceName: string;
    public group: string = '';
    public onlyIcanEdit: boolean = false;

    // Grid Global Variables
    public inject: InjectEdaPanel;
    public panels: EdaPanel[] = [];
    public panelsCopy: EdaPanel[] = [];
    public screen: number;
    public lanes: number = 40;
    public gridsterOptions: IGridsterOptions;
    public gridsterDraggableOptions: IGridsterDraggableOptions;
    public gridItemEvent: any;
    public itemOptions = {
        maxWidth: 40,
        maxHeight: 200,
        minWidth: 3,
        minHeight: 1,
        resizeHandles: { s: false, e: false, n: false, w: false, se: false, ne: false, sw: false, nw: false },
    };
    public tag: any;;
    public tags: Array<any>;
    public selectedtag: any;
    public addTag: boolean = false;
    public sendViaMailConfig: any = { enabled: false };


    // Display Variables
    public display_v = {
        minispinner: false, // mini spinner panel
        responsive: false, // responsive option
        rightSidebar: false, // sidebar dashboard options
        groups: false,
        shared: false, //if shared copy url is displayed
        edit_mode: true, //editable dashboard
        anonimous_mode: false,
        notSaved: false
    };

    //Date filter ranges Dropdown
    public datePickerConfigs: {} = {};

    public sharedURL: string;

    // Global filters vars
    public filtersList: Array<any> = [];
    public refreshTime: number = null;
    public stopRefresh: boolean = false;

    public styles : DashboardStyles;

    public filtrar: string = $localize`:@@filterButtonDashboard:Filtrar`;
    public addTagString: string = $localize`:@@addTag:AÑADIR ETIQUETA`;
    public newTag = $localize`:@@newTag:Nueva etiqueta`;
    public Seconds_to_refresh = $localize`:@@seconds_to_refresh:Intervalo de recarga`;
    public canIeditTooltip = $localize`:@@canIeditTooltip:Si esta opción está seleccionada sólo el propietario del informe y los administradores podrán guardar los cambios`;


    constructor(
        private dashboardService: DashboardService,
        private groupService: GroupService,
        private queryBuilderService: QueryBuilderService,
        private spinnerService: SpinnerService,
        private alertService: AlertService,
        private fileUtiles: FileUtiles,
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private dateUtilsService: DateUtils,
        private userService: UserService,
        private stylesProviderService: StyleProviderService
    ) {
        
        this.initializeResponsiveSizes();
        this.initializeGridsterOptions();
        this.initializeForm();
        let tags = JSON.parse(sessionStorage.getItem('tags'));
        if (tags) {
            this.tags = tags.filter(tag => tag.value !== 1);
        } else {
            this.tags = [];
        }
        this.tags.push({ value: 2, label: this.newTag });
    }

    // ng cycle lives
    public ngOnInit(): void {
        this.dashboard = new Dashboard({});

        this.initializeDashboard();
        this.initStyles();

        this.dashboardService.notSaved.subscribe(
            (data) => {
                this.display_v.notSaved = data
            },
            (err) => this.alertService.addError(err)
        )
        //JJ: Inicialitzo a false...
        this.dashboardService._notSaved.next(false);
        // this.display_v.notSaved = false;

    }

    /* Set applyToAllFilters for new panel when it's created */
    public ngAfterViewInit(): void {

        this.edaPanelsSubscription = this.edaPanels.changes.subscribe((comps: QueryList<EdaBlankPanelComponent>) => {
            const globalFilters = this.filtersList.filter(filter => filter.isGlobal === true);
            const unsetPanels = this.edaPanels.filter(panel => panel.panel.content === undefined);
            setTimeout(() => {
                unsetPanels.forEach(panel => {
                    globalFilters.forEach(filter => {
                        filter.panelList.push(panel.panel.id);
                        panel.setGlobalFilter(this.formatFilter(filter))
                    });
                });
            }, 0);
        });
    }

    public ngOnDestroy() {

        this.stopRefresh = true;
        if (this.edaPanelsSubscription) {
            this.edaPanelsSubscription.unsubscribe();
        }
    }

    private initStyles(): void{

        /**Global */
        this.stylesProviderService.panelColor.subscribe(panelColor => {
            document.documentElement.style.setProperty('--panel-color', panelColor);
        });

        /**Title */
        this.stylesProviderService.titleFontColor.subscribe(color => {
            document.documentElement.style.setProperty('--eda-title-font-color', color);
        });
        this.stylesProviderService.titleFontFamily.subscribe(font => {
            document.documentElement.style.setProperty('--eda-title-font-family', font);
        });
        this.stylesProviderService.titleFontSize.subscribe(size => {
            this.stylesProviderService.setTitleFontSize(size);
        });
        this.stylesProviderService.titleAlign.subscribe(align => {
            document.documentElement.style.setProperty('--justifyTitle', align)
        })

        /**Filters */
        this.stylesProviderService.filtersFontColor.subscribe(color => {
            document.documentElement.style.setProperty('--eda-filters-font-color', color);
        });
        this.stylesProviderService.filtersFontFamily.subscribe(font => {
            document.documentElement.style.setProperty('--eda-filters-font-family', font);
        });
        this.stylesProviderService.filtersFontSize.subscribe(size => {
            this.stylesProviderService.setfiltersFontSize(size);
        });

        /**Title */
        this.stylesProviderService.panelTitleFontColor.subscribe(color => {
            document.documentElement.style.setProperty('--panel-title-font-color', color);
        });
        this.stylesProviderService.panelTitleFontFamily.subscribe(font => {
            document.documentElement.style.setProperty('--panel-title-font-family', font);
        });
        this.stylesProviderService.panelTitleFontSize.subscribe(size => {
            this.stylesProviderService.setPanelTitleFontSize(size);
        });
        this.stylesProviderService.panelTitleAlign.subscribe(align => {
            document.documentElement.style.setProperty('--justifyPanelTitle', align)
        })

        /**Content */
        this.stylesProviderService.panelFontColor.subscribe(color => {
            document.documentElement.style.setProperty('--panel-font-color', color);
        });
        this.stylesProviderService.panelFontFamily.subscribe(font => {
            document.documentElement.style.setProperty('--panel-font-family', font);
        });
        this.stylesProviderService.panelFontSize.subscribe(size => {
            this.stylesProviderService.setPanelContentFontSize(size);
        });


    }

    // Init functions
    private initializeResponsiveSizes(): void {
        if (window.innerWidth >= 1200) {
            this.toLitle = false;
            this.toMedium = false;
        }
/* NO MORE TAMANY MIG
        if ((window.innerWidth < 1200) && (window.innerWidth > 1000)) {
            this.lanes = 20;
            this.toMedium = true;
            this.toLitle = false;
        }
*/
        if (window.innerWidth < 1000) {
            this.lanes = 10;
            this.toLitle = true;
            this.toMedium = false;
        }
    }

    private initializeGridsterOptions(): void {

        this.gridsterOptions = {
            lanes: this.lanes,
            direction: 'vertical',
            floating: false,
            dragAndDrop: window.innerWidth > 1000,
            resizable: window.innerWidth > 1000,
            resizeHandles: {
                sw: true,
                se: true,
            },
            widthHeightRatio: 1,
            lines: {
                visible: true,
                color: '#dbdbdb',
                width: 1
            },
            tolerance: 'pointer',
            shrink: true,
            useCSSTransforms: true,
            responsiveView: true, // turn on adopting items sizes on window resize and enable responsiveOptions
            responsiveDebounce: 500, // window resize debounce time
            responsiveSizes: true
        };

        this.gridsterDraggableOptions = {
            handlerClass: 'panel-heading'
        };


    }

    private initializeForm(): void {
        this.form = this.formBuilder.group({
            visible: [null, Validators.required],
            group: [[]]
        });

        this.visibleTypes = [
            { label: '', value: 'shared', icon: 'fa fa-share-alt' },
            { label: '', value: 'public', icon: 'fa fa-fw fa-globe' },
            { label: '', value: 'group', icon: 'fa fa-fw fa-users' },
            { label: '', value: 'private', icon: 'fa fa-fw fa-lock' }
        ];

        this.groupService.getGroupsByUser().subscribe(
            res => {
                this.grups = res;
                if (this.grups.length === 0) {
                    this.visibleTypes.splice(1, 1);
                }
                // pot ser que no estinguin disponibles encara els grups... per això  es crida des de els dos llocs
                // i es crida també des de aqui.... a mes a mes des de la inicilialització del dashboard
                // per estar segurn que es tenen disponibles.
                this.setDashboardGrups();
                this.setEditMode();
            },
            (err) => this.alertService.addError(err)
        );
    }

    private initializeDashboard(): void {

        const me = this;

        me.route.paramMap.subscribe(
            params => me.id = params.get('id'),
            err => me.alertService.addError(err)
        );

        if (me.id) {
            me.dashboardService.getDashboard(me.id).subscribe(
                res => {
                    /** res - retorna 2 objectes, el dashboard i el datasource per separat  */
                    const config = res.dashboard.config;
                    // Estableix els permisos d'edició i propietat...
                    this.setEditMode();
                    // Check dashboard owner
                    this.checkVisibility(res.dashboard);

                    me.title = config.title; // Titul del dashboard, utilitzat per visualització
                    me.filtersList = !_.isNil(config.filters) ? config.filters : []; // Filtres del dashboard
                    me.dataSource = res.datasource; // DataSource del dashboard
                    me.datasourceName = res.datasource.name;
                    me.applyToAllfilter = config.applyToAllfilter || { present: false, refferenceTable: null, id: null };
                    me.form.controls['visible'].setValue(config.visible);
                    me.tag = config.tag;
                    me.selectedtag = me.tags.filter(tag => tag.value === me.tag)[0];
                    me.refreshTime = config.refreshTime;
                    me.onlyIcanEdit = config.onlyIcanEdit;
                    if (me.refreshTime) {
                        this.stopRefresh = false;
                        this.startCountdown(me.refreshTime);
                    }
                    me.sendViaMailConfig = config.sendViaMailConfig || this.sendViaMailConfig;
                    me.styles = config.styles || this.stylesProviderService.generateDefaultStyles();

                    this.stylesProviderService.setStyles(me.styles);

                    // pot ser que no estinguin disponibles encara els grups... per això de vegades es perd
                    // i es crida també des de els subscribe del groupcontroller ... a mes a mes des de la inicilialització del dashboard
                    // per estar segurn que es tenen disponibles.
                    let grp = [];
                    if (config.visible === 'group' && res.dashboard.group) {
                        grp = res.dashboard.group;
                    }
           
                    
                    if (!res.dashboard.config.panel) { // Si el dashboard no te cap panel es crea un automatic
                        me.panels.push(
                            new EdaPanel({ id: me.fileUtiles.generateUUID(), title: $localize`:@@newPanelTitle:Nuevo Panel`, type: EdaPanelType.BLANK, w: 20, h: 10, dragAndDrop: true, resizable: true })
                        );

                        // Check url for filters in params
                        this.getUrlParams();
                        this.fillFiltersData();

                        me.dashboard = new Dashboard({
                            onlyIcanEdit: me.onlyIcanEdit, id: me.id, title: me.title, visible: config.visible, panel: me.panels, user: res.dashboard.user,
                            datasSource: me.dataSource, filters: [], applytoAllFilter: { present: false, refferenceTable: null, id: null }, group: grp
                        });

                    } else {
                        // Si te panels els carrega
                        me.panels = config.panel;
                        // Check url for filters in params
                        this.getUrlParams();
                        this.fillFiltersData();

                        me.dashboard = new Dashboard({
                            onlyIcanEdit: me.onlyIcanEdit, id: me.id, title: me.title, visible: config.visible, panel: config.panel, user: res.dashboard.user,
                            datasSource: me.dataSource, filters: config.filters, applytoAllFilter: me.applyToAllfilter, group: grp
                        });
                        /**To update panel filters with filters current data */
                        me.updateFilterDatesInPanels();
                    }

                    // pot ser que no estinguin disponibles encara els grups... per això es crida des de els dos llocs
                    // i es crida també des de els subscribe del groupcontroller ... a mes a mes des de la inicilialització del dashboard
                    // per estar segurn que es tenen disponibles.
                    if (config.visible === 'group') {
                        this.setDashboardGrups();
                    }


                    if (this.toLitle) {
                        this.initMobileSizes();
                    }

                    if (this.toMedium) {
                        this.initMediumSizes();
                    }

                    this.initializePanels();
                    // Fem una copia de seguretat per en cas de desastre :D
                    me.panels.forEach(p => {
                        me.panelsCopy.push(p);
                    });

                },
                err => {
                    me.alertService.addError(err);
                    if (err.text === "You don't have permission") {
                        console.log("You don't have permission");
                        this.router.navigate(['/login']);
                    }
                }
            );
        } else {
            // Si accedicis a un dashboard sense cap ID saltaria error
            me.alertService.addError('Error al cargar el Dashboard');
        }
    }

    private updateFilterDatesInPanels(): void {

        /**Set ranges for dates in panel filters */
        this.panels.filter(panel => panel.content).forEach(panel => {

            let panelFilters = [...panel.content.query.query.filters];
            panel.content.query.query.filters = [];

            panelFilters.forEach(pFilter => {

                if (!!pFilter.selectedRange) {

                    let range = this.dateUtilsService.getRange(pFilter.selectedRange);
                    let stringRange = this.dateUtilsService.rangeToString(range);

                    pFilter.filter_elements[0] = { value1: [stringRange[0]] }
                    pFilter.filter_elements[1] = { value2: [stringRange[1]] }

                }

                panel.content.query.query.filters.push(pFilter);

            });

        });

        /**Set ranges for dates in global filters */
        this.filtersList.filter(f => f.selectedRange).forEach(filter => {

            let range = this.dateUtilsService.getRange(filter.selectedRange);
            let stringRange = this.dateUtilsService.rangeToString(range);
            filter.selectedItems = stringRange;

            this.panels.filter(panel => panel.content).forEach(panel => {

                const panelFilters = [...panel.content.query.query.filters];
                panel.content.query.query.filters = [];

                panelFilters.forEach(pFilter => {

                    if (pFilter.filter_id === filter.id) {

                        panel.content.query.query.filters.push(this.formatFilter(filter));

                    } else {
                        panel.content.query.query.filters.push(pFilter);
                    }
                });
            });
        });
    }

    private getUrlParams(): void {
        this.route.queryParams.subscribe(params => {
            this.findGlobalFilterByUrlParams(params);
        });
    }

    // Dashboard Panels
    private initializePanels(): void {

        const user = sessionStorage.getItem('user');
        const userID = JSON.parse(user)._id;

        this.inject = {
            dataSource: this.dataSource,
            dashboard_id: this.dashboard.id,
            applyToAllfilter: this.applyToAllfilter,
            isObserver: this.grups.filter(group => group.name === 'RO' && group.users.includes(userID)).length !== 0
        }
    }

    private setPanelSizes(panel) {

        if (this.toLitle) {
            if (this.panels.length > 0) {
                const lastPanel = this.panels[this.panels.length - 1];
                panel.tamanyMobil.w = this.lanes;
                panel.tamanyMobil.h = 10;
                panel.tamanyMobil.x = 0;
                panel.tamanyMobil.y = lastPanel.tamanyMobil.y + lastPanel.tamanyMobil.h;
            }
        }
/* NO LONGER TAMANY MIG
        if (this.toMedium) {
            if (this.panels.length > 0) {
                const lastPanel = this.panels[this.panels.length - 1];
                panel.tamanyMig.w = 10;
                panel.tamanyMig.h = 10;
                panel.tamanyMig.x = 0;
                panel.tamanyMig.y = lastPanel.tamanyMig.y + lastPanel.tamanyMig.h;
            }
        }
*/
        this.panels.push(panel);
    }

    public reloadPanelsWithTimeOut() {
        setTimeout(() => this.reloadPanels(), 250);
    }

    public reloadPanels(): void {
        this.edaPanels.forEach(panel => {
            if (panel.currentQuery.length !== 0) {
                panel.display_v.chart = '';
                panel.runQueryFromDashboard(true);
            }
        });
    }

    // Dashboard control
    public async setEditMode() {
        const user = sessionStorage.getItem('user');
        const userName = JSON.parse(user).name;
        const userID = JSON.parse(user)._id;
        this.display_v.edit_mode = (userName !== 'edaanonim') && !(this.grups.filter(group => group.name === 'RO' && group.users.includes(userID)).length !== 0)
        this.display_v.anonimous_mode = (userName !== 'edaanonim');
    }



    private setDashboardGrups( ): void {
        const me = this;
        try{// debo recibir por un lado el dashboard y por otro el listado de roles. Mientras no tenga los dos esto fallará.
            // Lo puedo hacer cuando tengo los dos.
            if(me.grups.length > 0 && me.dashboard.group.length > 0 ){
                me.display_v.groups = true;
                const selectedGroups = [];
                for (let i = 0, n = me.grups.length; i < n; i += 1) {
                    const group: any = me.grups[i];
                    for (const dashGroup of me.dashboard.group) {
                        if (_.isEqual(group._id, dashGroup)) {
                            selectedGroups.push(group)
                        }
                    }
                }
                me.form.controls['group'].setValue(selectedGroups);
            }
        }catch(e){
            // todavia no se han seteado me.grups o me.dashboard.goup.
        }
    }

    private checkVisibility(dashboard) {
        if (!this.display_v.anonimous_mode && dashboard.config.visible !== 'shared') {
            console.log('Check visibility... you cannot see this dashboard');
            this.router.navigate(['/login']);
        }

        if (dashboard.config.visible === 'shared') {
            this.sharedURL = this.getsharedURL();
            this.display_v.shared = true;
        }
    }

    // Sizes functions
    private initMobileSizes() {
        let height = 0;
        let pannelHeight = 0;
        for (let i = 0, n = this.panels.length; i < n; i++) {
            // Init tamanys mobils
            const panel = this.panels[i];
            if (panel.tamanyMobil.h == 0) {
                if (i !== 0) {
                    panel.tamanyMobil.y = height;
                }
                pannelHeight = _.round(panel.h * 1.6);
                // si el panell es mes gran que la pantalla ho ajusto a la pantalla. 
                // tot això es fa per tenir el tamany d'una cela i multiplicar-ho per el 70% de la pantalla
                // vertical
                if ((pannelHeight * (window.innerWidth / this.lanes) > window.innerHeight) && (window.innerHeight > window.innerWidth)) {
                    pannelHeight = _.round((window.innerHeight / (window.innerWidth / this.lanes)) * 0.8);
                }
                //horitzontal
                if ((pannelHeight * (window.innerWidth / this.lanes) > window.innerHeight) && (window.innerHeight < window.innerWidth)) {
                    pannelHeight = _.round((window.innerHeight / (window.innerWidth / this.lanes)) * 1.1);
                }

                panel.tamanyMobil.w = this.lanes;
                panel.tamanyMobil.h = pannelHeight;
                panel.tamanyMobil.x = 0;
                height += pannelHeight;
            }

        }

    }

    private initMediumSizes() {
        for (let i = 0, n = this.panels.length; i < n; i++) {
            // Init tamanys mobils
            const panel = this.panels[i];
            if (panel.tamanyMig.h == 0) {
                panel.tamanyMig.x = _.round(panel.x / 2);
                panel.tamanyMig.y = _.round(panel.y / 1.5);
                panel.tamanyMig.w = _.round(panel.w / 2);
                panel.tamanyMig.h = _.round(panel.h / 1.5);
            }
        }
    }

    public onResize(event) {
        const innerWidth = event.target.innerWidth;
        if (innerWidth >= 1200) {
            this.lanes = 40;
            this.toLitle = false;
            this.toMedium = false;
            this.gridster.setOption('lanes', this.lanes).reload();
            /* NO MORE TAMANY MIG
        } else if ((innerWidth < 1200) && (innerWidth >= 1000)) {
            this.lanes = 20;
            this.toMedium = true;
            this.toLitle = false;
            this.gridster.setOption('lanes', this.lanes).reload();
            this.initMediumSizes();
        */
        } else {
            this.lanes = 10;
            this.toLitle = true;
            this.toMedium = false;
            this.gridster.setOption('lanes', this.lanes).reload();
            this.initMobileSizes();

        }
    }

    // Dashboard Filters
    public addGlobalFilter(): void {
        // Check if any panel isn't configurated
        let voidPanel = false;
        this.edaPanels.forEach(panel => {
            if (panel.currentQuery.length === 0) {
                voidPanel = true;
            }
        });
        if (voidPanel) {
            this.display_v.rightSidebar = false;
            Swal.fire({
                icon: 'success',
                showConfirmButton: true,
                title: $localize`:@@AddFiltersWarningTittle:Solo puedes añadir filtros cuando todos los paneles están configurados`,
                text: $localize`:@@AddFiltersWarningText:Puedes borrar los paneles en blanco o configurarlos`,
                showCancelButton: false,
                confirmButtonColor: '#3085d6',
                confirmButtonText: $localize`:@@AddFiltersWarningButton:Entendido`
            });
        } else {
            const params = {
                panels: this.panels,
                dataSource: this.dataSource
            };
            this.display_v.rightSidebar = false;
            this.filterController = new EdaDialogController({
                params,
                close: (event, response) => {
                    if (!_.isEqual(event, EdaDialogCloseEvent.NONE)) {

                        this.filtersList.push(response.filterList);
                        if (response.filterList.column.value.column_type === 'date' && response.filterList.selectedItems.length > 0) {
                            this.loadDatesFromFilter(response.filterList);
                        } else {
                            this.loadGlobalFiltersData(response);
                        }
                        // If default values are selected filter is applied
                        if (response.filterList.selectedItems.length > 0) {
                            this.applyGlobalFilter(response.filterList);
                        }
                        // If filter apply to all panels and this dashboard hasn't any 'apllyToAllFilter' new 'apllyToAllFilter' is set
                        if (response.filterList.applyToAll && (this.applyToAllfilter.present === false)) {
                            this.applyToAllfilter = { present: true, refferenceTable: response.targetTable, id: response.filterList.id };
                            this.updateApplyToAllFilterInPanels();
                        }
                        //not saved alert message
                        this.dashboardService._notSaved.next(true);
                    }
                    this.filterController = undefined;
                }
            });
        }
    }

    public saveAs() {
        this.display_v.rightSidebar = false;
        const params = {
            dataSource: this.dataSource
        };
        this.saveasController = new EdaDialogController({
            params,
            close: (event, response) => {
                if (!_.isEqual(event, EdaDialogCloseEvent.NONE)) {
                    const ds = { _id: this.dataSource._id };
                    const body = {
                        config: {
                            title: response.name, visible: response.visible, ds, tag: null, refreshTime: null,
                            styles: this.stylesProviderService.generateDefaultStyles(),
                        },
                        group: response.group
                            ? _.map(response.group, '_id')
                            : undefined
                    };

                    this.dashboardService.addNewDashboard(body).subscribe(
                        r => {
                            const body = {
                                config: {
                                    title: response.name,
                                    panel: this.dashboard.panel,
                                    ds: { _id: this.dataSource._id },
                                    filters: this.cleanFiltersData(),
                                    applyToAllfilter: this.applyToAllfilter,
                                    visible: response.visible,
                                    tag: this.getTag(),
                                    refreshTime: (this.refreshTime > 5) ? this.refreshTime : this.refreshTime ? 5 : null,
                                    mailingAlertsEnabled: this.getMailingAlertsEnabled(),
                                    sendViaMailConfig: this.sendViaMailConfig,
                                    onlyIcanEdit: this.onlyIcanEdit,
                                    styles:this.styles

                                },
                                group: response.group ? _.map(response.group, '_id') : undefined
                            };

                            this.edaPanels.forEach(panel => {
                                panel.savePanel();
                            });

                            this.dashboardService.updateDashboard(r.dashboard._id, body).subscribe(
                                () => {
                                    this.dashboardService._notSaved.next(false);
                                    this.display_v.rightSidebar = false;
                                    this.alertService.addSuccess($localize`:@@dahsboardSaved:Informe guardado correctamente`);
                                    this.router.navigate(['/dashboard/', r.dashboard._id]).then(() => {
                                        window.location.reload();
                                    });

                                },
                                err => {
                                    this.dashboardService._notSaved.next(false);
                                    this.display_v.rightSidebar = false;
                                    this.alertService.addError(err);
                                }
                            );
                        },
                        err => this.alertService.addError(err)
                    );
                }
                this.saveasController = null;
            }
        });
    }

    public editStyles() {
        this.display_v.rightSidebar = false;
        const params = this.styles;
        this.editStylesController = new EdaDialogController({
            params,
            close: (event, response) => {
                if (!_.isEqual(event, EdaDialogCloseEvent.NONE)) {
                    this.stylesProviderService.setStyles(response);
                    this.styles = response;
                    this.dashboardService._notSaved.next(true);
                }     
                this.editStylesController = null;
            }
        })
    }

    /** Updates applyToAllFilter in every panel */
    private updateApplyToAllFilterInPanels(): void {
        this.edaPanels.forEach(panel => {
            panel.inject.applyToAllfilter = this.applyToAllfilter;
            panel.reloadTablesData();
        })
    }

    /** Loads columns by given table */
    private loadGlobalFiltersData(params): void {
        const filter = params.filterList;

        const queryParams = {
            table: params.targetTable,
            dataSource: this.dataSource._id,
            dashboard: '',
            panel: '',
            filters: []
        };

        filter.column.value.ordenation_type = 'ASC';

        this.dashboardService
            .executeQuery(this.queryBuilderService.normalQuery([filter.column.value], queryParams))
            .subscribe(
                res => {
                    filter.data = res[1].filter(item => !!item[0]).map(item => ({ label: item[0], value: item[0] }));
                }, err => {
                    this.alertService.addError(err);
                }
            );
    }

    private findGlobalFilterByUrlParams(urlParams: any): void {

        if (Object.keys(urlParams).length > 0) {
            for (let i = 0, n = this.filtersList.length; i < n; i += 1) {
                const filter = this.filtersList[i];
                for (const param of Object.keys(urlParams)) {
                    const paramTable = _.split(param, '.')[0];
                    const paramColumn = _.split(param, '.')[1];

                    if (filter.table.value === paramTable) {
                        if (filter.column.value.column_name === paramColumn) {
                            filter.selectedItems = _.split(urlParams[param], '|');

                            filter.panelList
                                .map(id => this.panels.find(p => p.id === id))
                                .forEach((panel) => {
                                    const panelFilter = panel.content.query.query.filters;
                                    const newFilter = this.formatFilter(filter);
                                    panelFilter.splice(_.findIndex(panelFilter, (inx) => inx.filter_column === newFilter.filter_column), 1);
                                    panelFilter.push(newFilter);

                                });

                        }
                    }
                }
            }
        }
    }

    private formatFilter(filter): any {

        const isDate = filter.column.value.column_type === 'date';
        const year_length = 4;
        const year_month_length = 7;

        if (isDate && filter.selectedItems[0] && !filter.selectedItems[1]) {
            const year = filter.selectedItems[0];
            if (filter.selectedItems[0].length === year_length) {
                filter.selectedItems[0] = `${year}-01-01`;
                filter.selectedItems[1] = `${year}-12-31`;
            }
            else if (filter.selectedItems[0].length === year_month_length) {
                const year_month = filter.selectedItems[0];
                const year = parseInt(year_month.slice(0, 5))
                const month = parseInt(year_month.slice(5, 7));
                let days = new Date(year, month, 0).getDate();
                let daysstr = days < 10 ? `0${days}` : `${days}`
                filter.selectedItems[0] = `${year_month}-01`;
                filter.selectedItems[1] = `${year_month}-${daysstr}`;
            } else {
                filter.selectedItems[1] = filter.selectedItems[0]
            }
        }

        const formatedFilter = {
            filter_id: filter.id,
            filter_table: filter.table.value,
            filter_column: filter.column.value.column_name,
            filter_type: isDate ? 'between' : 'in',
            filter_elements: isDate ?
                [
                    { value1: filter.selectedItems[0] ? [filter.selectedItems[0]] : [] },
                    { value2: filter.selectedItems[1] ? [filter.selectedItems[1]] : [] }
                ]
                : [{ value1: filter.selectedItems }],
            isGlobal: true,
            applyToAll: filter.applyToAll
        }

        return formatedFilter;
    }

    /** Ajsust the filter dorpdwon widht to make it easier to read.... */
    public adjustSize(filter): void {
            // miro si els elements del filtre son llargs....
            let bol = false;
            for(var i=0; i< filter.data.length ; i++){
                if(filter.data[i].value.length > 60 ){
                    bol = true;
                    i = i+filter.data.length;
                }
            }
            
            // si els elements del filtre son llargs amplio el multiselect. 
            if(bol){    
                const dropdowns = document.querySelectorAll('p-multiselect');
                try{
                dropdowns.forEach(d=>{
                    d.getElementsByTagName("p-multiselect-label");
                    if (d.getElementsByClassName("p-multiselect-label")[0].textContent.trim()   == filter.column.label ){
                        const elems =  d.getElementsByClassName('p-multiselect-panel')  ;
                        for( var i = 0; i< elems.length; i++ ){
                            elems[i].setAttribute("style", "width: 500px !important;  z-index:1000; ");       
                        }
                    }
                })
                }catch(e){
                        // no passa res... estic aplicant estils.....
                }

             }



    }

    
    /** Apply filter to panels when filter's selected value changes */
    public applyGlobalFilter(filter): void {
        const newFilter = this.formatFilter(filter);
        filter.panelList
            .map(id => this.edaPanels.toArray().find(p => p.panel.id === id))
            .forEach((panel) => {
                panel.setGlobalFilter(newFilter);
            });

        // this.reloadPanels();
    }


    public removeGlobalFilter(filter: any): void {
        // Remove 'applytoall' filter if it's the same fitler
        if (this.applyToAllfilter && filter.id === this.applyToAllfilter.id) {
            this.applyToAllfilter = { present: false, refferenceTable: null, id: null };
            this.updateApplyToAllFilterInPanels();
        }

        // Update fileterList and clean panels' filters
        this.filtersList = this.filtersList.filter(f => f.id !== filter.id);
        this.edaPanels.forEach(panel => {
            panel.globalFilters = panel.globalFilters.filter(f => f.filter_id !== filter.id);
        });
        //not saved alert message
        this.dashboardService._notSaved.next(true);
        this.reloadPanels();
    }

    private cleanFiltersData() {
        const filtersCleaned = [];

        for (let i = 0, n = this.filtersList.length; i < n; i += 1) {
            const filter = _.cloneDeep(this.filtersList[i]);

            filter.data = null;
            filtersCleaned.push(filter);
        }
        return filtersCleaned;
    }

    private fillFiltersData() {
        for (let i = 0, n = this.filtersList.length; i < n; i += 1) {
            const filter = this.filtersList[i];

            const params = { filterList: filter, targetTable: filter.table.value };

            if (filter.column.value.column_type === 'date') {
                this.loadDatesFromFilter(filter)
            } else {
                this.loadGlobalFiltersData(params);
            }
        }
    }

    /**
     * Set datePicker's configuration
     * @param filter 
     */
    private loadDatesFromFilter(filter) {
        this.datePickerConfigs[filter.id] = new EdaDatePickerConfig();
        const config = this.datePickerConfigs[filter.id];
        config.dateRange = [];
        config.range = filter.selectedRange;
        config.filter = filter;
        if (filter.selectedItems.length > 0) {
            if (!filter.selectedRange) {
                let firstDate = filter.selectedItems[0];
                let lastDate = filter.selectedItems[filter.selectedItems.length - 1];
                config.dateRange.push(new Date(firstDate.replace(/-/g, '/')));
                config.dateRange.push(new Date(lastDate.replace(/-/g, '/')));
            }
        }
    }

    /**
     * Process data from date picker and apply filter
     * @param event dates and range(week, month, year, all) if any
     * @param filter 
     */
    public processPickerEvent(event: any, filter: any): void {
        if (event.dates) {
            const dtf = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit' });
            if (!event.dates[1]) {
                event.dates[1] = event.dates[0];
            }

            let stringRange = [event.dates[0], event.dates[1]]
                .map(date => {
                    let [{ value: mo }, , { value: da }, , { value: ye }] = dtf.formatToParts(date);
                    return `${ye}-${mo}-${da}`
                });

            filter.selectedItems = stringRange;
            filter.selectedRange = event.range;
            this.loadDatesFromFilter(filter)
            this.applyGlobalFilter(filter);
        }

    }

    // Sidebar functions
    public onAddWidget(): void {
        let panel = new EdaPanel({
            id: this.fileUtiles.generateUUID(),
            title: $localize`:@@newPanelTitle2:Nuevo Panel`,
            type: EdaPanelType.BLANK,
            w: 20,
            h: 10,
            resizable: true,
            dragAndDrop: true
        });

        this.setPanelSizes(panel);
        this.display_v.rightSidebar = false;
    }

    public onAddTitle(): void {
        let panel = new EdaTitlePanel({
            id: this.fileUtiles.generateUUID(),
            title: 'Titulo',
            type: EdaPanelType.TITLE,
            w: 20,
            h: 1,
            resizable: true,
            dragAndDrop: true,
            fontsize: '22px',
            color: '#000000'
        });
        this.setPanelSizes(panel);
        this.display_v.rightSidebar = false;
    }

    public onRemovePanel(panel): void {
        this.panels.splice(_.findIndex(this.panels, { id: panel }), 1);

        for (let i = 0, n = this.filtersList.length; i < n; i += 1) {
            const filter = this.filtersList[i];
            filter.panelList = filter.panelList.filter(id => id !== panel);
        }
    }


    onDuplicatePanel(panel){
        this.panels.push(panel);
        this.dashboardService._notSaved.next(true);

    }


    public onResetWidgets(): void {
            let body =
            {
                model_id: this.dataSource._id,
                queries: this.panels.filter( panel=>panel.content ).map(panel =>{ panel.content.query.query})
            }

            this.dashboardService.cleanCache(body).subscribe(
                res => {
                    this.initializeDashboard();
                    this.display_v.rightSidebar = false;
                    this.dashboardService._notSaved.next(false);
                },
                err => console.log(err)
            )
    }

    public getsharedURL(): string {
        const url = location.href;
        const baseURL = url.slice(0, url.indexOf('#'));

        return `${baseURL}#/public/${this.id}`
    }

    public copyURL(): void {
        let $body = document.getElementsByTagName('body')[0];
        const value = this.getsharedURL();

        let copyToClipboard = function (value) {
            let $tempInput = document.createElement('INPUT') as HTMLInputElement;
            $body.appendChild($tempInput);
            $tempInput.setAttribute('value', value)
            $tempInput.select();
            document.execCommand('copy');
            $body.removeChild($tempInput);
        }

        copyToClipboard(value);

        this.saveDashboard();
    }

    public saveDashboard(): void {

        this.triggerTimer();

        if (this.form.invalid) {
            this.display_v.rightSidebar = false;
            this.alertService.addError($localize`:@@mandatoryFields:Recuerde rellenar los campos obligatorios`);
        } else {

            const body = {
                config: {
                    title: this.title,
                    panel: this.dashboard.panel,
                    ds: { _id: this.dataSource._id },
                    filters: this.cleanFiltersData(),
                    applyToAllfilter: this.applyToAllfilter,
                    visible: this.form.controls['visible'].value,
                    tag: this.getTag(),
                    refreshTime: (this.refreshTime > 5) ? this.refreshTime : this.refreshTime ? 5 : null,
                    mailingAlertsEnabled: this.getMailingAlertsEnabled(),
                    sendViaMailConfig: this.sendViaMailConfig,
                    onlyIcanEdit: this.onlyIcanEdit,
                    styles : this.styles

                },
                group: this.form.value.group ? _.map(this.form.value.group, '_id') : undefined
            };

            this.edaPanels.forEach(panel => {
                panel.savePanel();
            });

            this.dashboardService.updateDashboard(this.id, body).subscribe(
                () => {
                    this.display_v.rightSidebar = false;
                    this.alertService.addSuccess($localize`:@@dahsboardSaved:Informe guardado correctamente`);
                },
                err => {
                    this.display_v.rightSidebar = false;
                    this.alertService.addError(err);
                }
            );

            //not saved alert message
            this.dashboardService._notSaved.next(false);
        }
    }

    public getMailingAlertsEnabled(): boolean {

        let mailingenabled = false;

        this.dashboard.panel.forEach(panel => {
            if (panel.content && panel.content.chart === 'kpi') {
                try{
                    panel.content.query.output.config.alertLimits.forEach(alert => {
                        if (alert.mailing.enabled === true) {
                            mailingenabled = true
                        };
                    });
                }catch(e){
                        console.log('error getting mailing alerts.... setting it to false');
                        mailingenabled = false;
                }
            }
        });

        return mailingenabled;
    }

    public getTag() {

        if (this.tag && this.tag.value === 0) return null;
        else if (this.tag && this.tag.value) return this.tag.label;
        else if (this.tag) return this.tag;
        else return null;

    }

    public exportAsPDF() {
        this.display_v.rightSidebar = false;
        this.spinnerService.on();
        const title = this.title;
        domtoimage.toJpeg(document.getElementById('myDashboard'), { bgcolor: 'white' })
            .then((dataUrl) => {
                let img = new Image();
                img.src = dataUrl;
                img.onload = () => {
                    let pdf = new jspdf('l', 'pt', [img.width, img.height]);
                    let width = pdf.internal.pageSize.getWidth();
                    let height = pdf.internal.pageSize.getHeight();
                    pdf.addImage(img, 'JPEG', 0, 0, width, height);
                    pdf.save(`${title}.pdf`);
                }
                this.spinnerService.off();
            });

    }

    public exportAsJPEG() {
        this.display_v.rightSidebar = false;
        this.spinnerService.on();
        const title = this.title;
        domtoimage.toJpeg(document.getElementById('myDashboard'), { bgcolor: 'white' })
            .then((dataUrl) => {
                var link = document.createElement('a');
                link.download = `${title}.jpeg`;
                link.href = dataUrl;
                link.click();
                this.spinnerService.off();
            });
    }

    public openMailConfig() {
        const params = { dashboard: this.id, config: this.sendViaMailConfig };
        this.display_v.rightSidebar = false;
        this.emailController = new EdaDialogController({
            params,
            close: (event, response) => {
                if (!_.isEqual(event, EdaDialogCloseEvent.NONE)) {
                    this.sendViaMailConfig = response;
                    this.saveDashboard();
                }
                this.emailController = undefined;
            }
        });

    }

    // Others
    public handleSelectedBtn(event): void {
        const groupControl = this.form.get('group');
        this.display_v.groups = event.value === 'group';
        this.display_v.shared = event.value === 'shared';
        if (this.display_v.groups) {
            groupControl.setValidators(Validators.required);
        }

        if (!this.display_v.groups) {
            if (event.value !== 'shared') {
                this.saveDashboard();
            }
            groupControl.setValidators(null);
            groupControl.setValue(null);
        }
    }

    public setTitle(): void {
        this.titleClick = !this.titleClick;
    }

    // Podem agafar els events del panel
    public itemChange($event: any, panel): void {
        this.gridItemEvent = $event;
        let found = this.edaPanels.filter(edaPanel => edaPanel.panel.id === panel.id)[0];
        if (
            found
            && panel.content
            && !found.panelChart.NO_DATA
            && (['parallelSets', 'kpi',  'dynamicText', 'treeMap', 'scatterPlot', 'knob', 'funnel', 'sunburst'].includes(panel.content.chart))
            && !$event.isNew) {
            found.savePanel();
        }// found.onGridsterResize($event);
    }

    public selectTag() {
        this.addTag = this.selectedtag.label === this.newTag;
        this.tag = this.selectedtag;
        if (this.tag.value === 0) this.tag.label = null;
    }

    public startCountdown(seconds: number) {

        if (!this.stopRefresh) {
            let counter = seconds;
            const interval = setInterval(() => {

                counter--;
                if (counter < 0 && !this.stopRefresh) {
                    clearInterval(interval);
                    this.onResetWidgets();
                    this.startCountdown(seconds);
                } else if (this.stopRefresh) {
                    clearInterval(interval);
                    return;
                }
            }, 1000);
        } else return;
    }

    triggerTimer() {

        this.stopRefresh = !this.stopRefresh;

        //Give time to stop counter if any
        setTimeout(() => {
            if (!this.refreshTime) this.stopRefresh = true;
            else if (this.refreshTime) this.stopRefresh = false;

            if (this.refreshTime && this.refreshTime < 5) this.refreshTime = 5;

            this.startCountdown(this.refreshTime);

        }, 2000)

    }
    public canIedit() {
        let result: boolean = false;
        result = this.userService.isAdmin;
        // si no es admin...  
        if (result == false) {
            if (this.dashboard.onlyIcanEdit) {
                if (this.userService.user._id == this.dashboard.user) {
                    result = true;
                }
            } else {
                result = true;
            }

        }
        return result;
    }
}
