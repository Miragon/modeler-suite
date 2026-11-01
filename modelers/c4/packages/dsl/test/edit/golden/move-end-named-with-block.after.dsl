workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        crm = softwareSystem "CRM"
        sync = api -> crm "Syncs customers" "HTTPS" "Nightly" {
            tags "Batch"
            url "https://example.com/sync"
            properties {
                "owner" "crm-team"
            }
            perspectives {
                "Security" "Uses mTLS."
            }
        }
        !relationship sync {
            tag "Reviewed"
        }
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.crm" "400,0"
                "c4modeler.element.shop" "0,0"
                "c4modeler.relationship.implied:shop->crm" "320,-80"
            }
        }
    }
}
